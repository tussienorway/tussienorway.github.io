import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agder_berging_ai import (
    beregn_nodhjelp_posisjon,
    finn_e18_avkjorsel,
    haversine_km,
    kalkuler_bat_og_spesialtransport,
    kalkuler_forsikring_egenandel,
    klassifiser_hendelse,
    last_fakta,
    opprett_nodanrop,
    valider_telefon,
)


class TestAgderBilbergingAI(unittest.TestCase):
    def setUp(self):
        self.fakta = last_fakta()

    def test_fakta_struktur_og_nøkkeltall(self):
        """Verifiser at bedriftsfakta inneholder ekte data fra Brønnøysund og Proff."""
        self.assertEqual(self.fakta["orgnr"], "919 084 030")
        self.assertEqual(self.fakta["firma"], "Agder Bilberging AS")
        self.assertEqual(self.fakta["daglig_leder"], "Jan Ove Thygesen")
        self.assertEqual(self.fakta["omsetning_nok"], 11331594)
        self.assertEqual(self.fakta["telefon_dognvakt"], "+47 905 66 147")
        self.assertIn("Viking Redningstjeneste", self.fakta["samarbeid"])
        self.assertGreaterEqual(len(self.fakta["flate"]), 5)

    def test_klassifiser_e18_krever_tma_pute(self):
        """Uhell på E18 må alltid flagge krav om TMA-støtputebil av HMS-hensyn."""
        res = klassifiser_hendelse("Bilen stoppet i høyre felt på E18 ved Fevik.")
        self.assertTrue(res["krever_tma_sikring"])
        self.assertIsNotNone(res["tma_bil"])
        self.assertIn("PUTE-02", res["tma_bil"])

    def test_klassifiser_tunnel_krever_tma(self):
        """Uhell i tunnel krever alltid TMA-varsling og skjerming."""
        res = klassifiser_hendelse("Stans i Grimstadtunnelen retning Kristiansand.")
        self.assertTrue(res["krever_tma_sikring"])
        self.assertIn("PUTE-02", res["tma_bil"])

    def test_klassifiser_tungberging_vogntog(self):
        """Vogntog eller lastebil skal automatisk velge Scania 8x4 tungberger."""
        res = klassifiser_hendelse("Et vogntog har veltet i grøfta på E18 ved Lillesand.")
        self.assertEqual(res["kategori"], "tungberging")
        self.assertIn("TUNG-01", res["anbefalt_primarressurs"])
        self.assertTrue(res["krever_tma_sikring"])

    def test_klassifiser_bat_transport(self):
        """Båtforespørsel skal rute til båttransport med kran."""
        res = klassifiser_hendelse("Trenger båtløft og transport av en 22 fots daycruiser fra Grimstad gjestehavn.")
        self.assertEqual(res["kategori"], "bat_transport")
        self.assertIn("KRAN-04", res["anbefalt_primarressurs"])

    def test_klassifiser_terreng_4x4(self):
        """Fastkjørt bil på skogsvei eller i myr ruter til Land Cruiser 4x4."""
        res = klassifiser_hendelse("Fastkjørt i dyp snøfonn på skogsvei i Froland.")
        self.assertEqual(res["kategori"], "terreng_vinsj")
        self.assertIn("4X4-05", res["anbefalt_primarressurs"])

    def test_klassifiser_elbil_skates(self):
        """Elbil med motorstopp eller låst aksel ruter til flakbil."""
        res = klassifiser_hendelse("Elbil med flatt 12V batteri og låst elektronisk håndbrekk.")
        self.assertEqual(res["kategori"], "akutt_berging")
        self.assertIn("FLAK-03", res["anbefalt_primarressurs"])

    def test_haversine_og_posisjonering_grimstad(self):
        """Test GPS-beregning fra Grimstad sentrum til basen i Industriveien."""
        # Grimstad sentrum: 58.3405, 8.5934
        pos = beregn_nodhjelp_posisjon(58.3405, 8.5934, self.fakta)
        self.assertEqual(pos["status"], "posisjonert")
        self.assertLess(pos["avstand_base_km"], 5.0)
        self.assertTrue(pos["innenfor_dekningsomraade"])
        self.assertLessEqual(pos["eta_min"], 20)

    def test_posisjonering_mangler_gps(self):
        """Edge case: ingen GPS gitt."""
        pos = beregn_nodhjelp_posisjon(None, None, self.fakta)
        self.assertEqual(pos["status"], "mangler_posisjon")
        self.assertIsNone(pos["avstand_base_km"])
        self.assertFalse(pos["innenfor_dekningsomraade"])

    def test_posisjonering_utenfor_dekningsomraade(self):
        """Edge case: koordinater langt utenfor kjerneområdet (f.eks. Oslo)."""
        pos = beregn_nodhjelp_posisjon(59.9139, 10.7522, self.fakta)
        self.assertEqual(pos["status"], "posisjonert")
        self.assertGreater(pos["avstand_base_km"], 150.0)
        self.assertFalse(pos["innenfor_dekningsomraade"])

    def test_batkalkulator_grenseverdier_og_klasser(self):
        """Test beregning av båttransportpriser på og rundt grenseverdier."""
        # Standardbåt: 24 fot og 2.5 tonn (eksakt grense)
        kalk_grense_std = kalkuler_bat_og_spesialtransport(lengde_fot=24.0, vekt_tonn=2.5, distanse_km=10.0)
        self.assertTrue(kalk_grense_std["gyldig"])
        self.assertEqual(kalk_grense_std["klasse"], "standard_bat")
        self.assertEqual(kalk_grense_std["estimat_kr"], 2800 + 1200 + (10 * 45))
        self.assertFalse(kalk_grense_std["krever_dispensasjon"])

        # Tung båt: 24.5 fot (rett over standardgrense)
        kalk_tung = kalkuler_bat_og_spesialtransport(lengde_fot=24.5, vekt_tonn=2.6, distanse_km=15.0)
        self.assertTrue(kalk_tung["gyldig"])
        self.assertEqual(kalk_tung["klasse"], "tung_bat")
        self.assertEqual(kalk_tung["estimat_kr"], 4500 + 2500 + (15 * 65))
        self.assertFalse(kalk_tung["krever_dispensasjon"])

        # Maksimum standardgrense: 36 fot og 10.0 tonn
        kalk_maks = kalkuler_bat_og_spesialtransport(lengde_fot=36.0, vekt_tonn=10.0, distanse_km=20.0)
        self.assertTrue(kalk_maks["gyldig"])
        self.assertEqual(kalk_maks["klasse"], "tung_bat")
        self.assertFalse(kalk_maks["krever_dispensasjon"])

        # For stor båt krever dispensasjon fra Statens vegvesen (> 36 fot)
        kalk_stor_lengde = kalkuler_bat_og_spesialtransport(lengde_fot=36.5, vekt_tonn=8.0)
        self.assertTrue(kalk_stor_lengde["gyldig"])
        self.assertTrue(kalk_stor_lengde["krever_dispensasjon"])
        self.assertEqual(kalk_stor_lengde["klasse"], "tung_spesialtransport")
        self.assertIsNone(kalk_stor_lengde["pris_anslag_kr"])

        # For tung båt (> 10 tonn)
        kalk_stor_vekt = kalkuler_bat_og_spesialtransport(lengde_fot=30.0, vekt_tonn=11.5)
        self.assertTrue(kalk_stor_vekt["gyldig"])
        self.assertTrue(kalk_stor_vekt["krever_dispensasjon"])

        # Ugyldig input (0 eller negative verdier)
        self.assertFalse(kalkuler_bat_og_spesialtransport(lengde_fot=-5, vekt_tonn=1.0)["gyldig"])
        self.assertFalse(kalkuler_bat_og_spesialtransport(lengde_fot=20, vekt_tonn=0.0)["gyldig"])

    def test_telefonvalidering(self):
        """Test norske telefonnumre med ulike prefikser og formater."""
        self.assertTrue(valider_telefon("90566147"))
        self.assertTrue(valider_telefon("+47 905 66 147"))
        self.assertTrue(valider_telefon("0047 90566147"))
        self.assertTrue(valider_telefon("41234567"))
        self.assertTrue(valider_telefon("37000000"))
        self.assertFalse(valider_telefon("123"))
        self.assertFalse(valider_telefon("abc"))
        self.assertFalse(valider_telefon(""))

    def test_opprett_nodanrop_komplett(self):
        """Oppretting av anrop på E18 med prioritet og SMS-generering."""
        anrop = opprett_nodanrop(
            tekst="Punktering og kollisjon med autovern på E18 ved Fevik",
            posisjon={"lat": 58.3845, "lng": 8.6543},
            kundenavn="Ola Nordmann",
            telefon="99887766",
            registreringsnummer="EK12345",
            fakta=self.fakta
        )
        self.assertEqual(anrop["status"], "opprettet")
        self.assertEqual(anrop["prioritet"], "P1_KRITISK")
        self.assertTrue(anrop["triage"]["krever_tma_sikring"])
        self.assertIn("[AGDER BILBERGING VAKT]", anrop["vakt_dispatch_sms"])
        self.assertIn("EK12345", anrop["vakt_dispatch_sms"])

    def test_opprett_nodanrop_mangler(self):
        """Edge case: mangler telefon og tekst."""
        anrop = opprett_nodanrop(
            tekst="",
            posisjon=None,
            kundenavn="",
            telefon="",
            fakta=self.fakta
        )
        self.assertEqual(anrop["status"], "ufullstendig")
        self.assertIn("gyldig_telefon", anrop["mangler"])
        self.assertIn("kundenavn", anrop["mangler"])


    def test_kalkuler_forsikring_kasko(self):
        """Kasko og delkasko skal gi 500 kr egenandel og null bonustap."""
        res = kalkuler_forsikring_egenandel("gjensidige", "kasko")
        self.assertTrue(res["veihjelp_dekket"])
        self.assertEqual(res["egenandel_kr"], 500)
        self.assertFalse(res["bonustap"])
        self.assertTrue(res["direkteoppgjor"])

    def test_finn_e18_avkjorsel(self):
        """Bie-krysset og Fevik skal gi presise km og ETA fra basen."""
        bie = finn_e18_avkjorsel("bie_grimstad")
        self.assertTrue(bie["funnet"])
        self.assertLessEqual(bie["km_fra_base"], 3.0)
        self.assertLessEqual(bie["eta_min"], 10)


if __name__ == "__main__":
    unittest.main(verbosity=2)
