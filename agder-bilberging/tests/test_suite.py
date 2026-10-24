import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agder_berging_ai import (
    beregn_nodhjelp_posisjon,
    finn_e18_avkjorsel,
    finn_optimal_bergingsressurs,
    haversine_km,
    kalkuler_bat_og_spesialtransport,
    kalkuler_forsikring_egenandel,
    klassifiser_hendelse,
    last_fakta,
    opprett_nodanrop,
    sjekk_flate_beredskap,
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

    def test_flate_beredskap_drivstoff_og_dekk(self):
        """Test flåteanalyse for drivstoff (<35%), mønsterdybde, kjettinger og kranwire."""
        rapport = sjekk_flate_beredskap(fakta=self.fakta)
        self.assertEqual(rapport["totalt_biler"], 5)
        self.assertEqual(rapport["antall_operative"], 5)
        self.assertEqual(rapport["antall_lav_drivstoff"], 1)  # FLAK-03 har 28%
        
        # Finn FLAK-03 og sjekk lavt drivstoffvarsel
        flak = next(b for b in rapport["biler"] if b["id"] == "FLAK-03")
        self.assertTrue(flak["lav_drivstoff"])
        self.assertEqual(flak["drivstoff_prosent"], 28)
        self.assertTrue(flak["har_elbil_skates"])
        self.assertTrue(flak["har_oljesanering"])

        # Sjekk TUNG-01 og 4X4-05
        tung = next(b for b in rapport["biler"] if b["id"] == "TUNG-01")
        self.assertFalse(tung["lav_drivstoff"])
        self.assertTrue(tung["sertifisert_wire"])
        self.assertEqual(tung["kjettinger_sett"], 4)

        landcruiser = next(b for b in rapport["biler"] if b["id"] == "4X4-05")
        self.assertTrue(landcruiser["piggdekk"])
        self.assertGreaterEqual(landcruiser["monsterdybde_mm"], 10.0)

    def test_flate_beredskap_kritisk_monsterdybde_edge_case(self):
        """Edge case: Kjøretøy med under 5.0 mm mønsterdybde skal flagges som KRITISK dekkfeil."""
        slitt_flate = [
            {
                "id": "TEST-01",
                "modell": "Scania Test",
                "status": "beredskap",
                "drivstoff": {"prosent": 80, "rekkevidde_km": 600},
                "dekk": {"monsterdybde_mm": 3.8, "minstekrav_mm": 5.0, "kjettinger_godkjent": True},
                "utstyr_status": {"sertifisert_kranwire": True}
            }
        ]
        rapport = sjekk_flate_beredskap(flate=slitt_flate, fakta=self.fakta)
        self.assertEqual(rapport["antall_dekkvarsler"], 1)
        self.assertEqual(rapport["antall_operative"], 0)
        self.assertEqual(rapport["varsler"][0]["type"], "DEKKSLITASJE")

    def test_flate_beredskap_manglende_wire_edge_case(self):
        """Edge case: Kranbil/tungbil uten sertifisert wire skal flagge KRANWIRE_KONTROLL og settes som uoperativ."""
        usertifisert_flate = [
            {
                "id": "TUNG-01",
                "modell": "Scania",
                "status": "beredskap",
                "drivstoff": {"prosent": 80, "rekkevidde_km": 600},
                "dekk": {"monsterdybde_mm": 8.0, "minstekrav_mm": 5.0, "kjettinger_godkjent": True},
                "utstyr_status": {"sertifisert_kranwire": False}
            }
        ]
        rapport = sjekk_flate_beredskap(flate=usertifisert_flate, fakta=self.fakta)
        self.assertEqual(rapport["antall_utstyrsvarsler"], 1)
        self.assertEqual(rapport["varsler"][0]["type"], "KRANWIRE_KONTROLL")
        self.assertEqual(rapport["antall_operative"], 0)
        self.assertFalse(rapport["biler"][0]["operativ"])

    def test_finn_optimal_bergingsressurs_e18_tungberging(self):
        """E18 uhell med vogntog skal allokere TUNG-01 + PUTE-02 TMA-støtpute og generere SMS."""
        res = finn_optimal_bergingsressurs(
            hendelse_tekst="Vogntog med henger har sakset på E18 ved Fevik, sperrer venstre felt",
            posisjon={"lat": 58.3845, "lng": 8.6543},
            kundenavn="Litauisk Transportselskap",
            telefon="91234567",
            regnr="AA12345",
            fakta=self.fakta
        )
        self.assertEqual(res["primar_bil_id"], "TUNG-01")
        self.assertTrue(res["krever_tma"])
        self.assertIsNotNone(res["tma_bil"])
        self.assertIn("PUTE-02", res["sjafor_sms"])
        self.assertIn("refleksvest og vent bak autovernet", res["bilist_sms"])
        self.assertTrue(res["drivstoff_tilstrekkelig"])

    def test_finn_optimal_bergingsressurs_elbil_lavt_drivstoff(self):
        """Elbil med låst aksel skal velge FLAK-03 og flagge lav drivstoffreserve (28%)."""
        res = finn_optimal_bergingsressurs(
            hendelse_tekst="Elbil Tesla Model Y har låst alle fire hjul etter feil, trenger skates",
            posisjon={"lat": 58.3512, "lng": 8.5721},
            kundenavn="Kari Nordmann",
            telefon="99887766",
            regnr="EB99887",
            fakta=self.fakta
        )
        self.assertEqual(res["primar_bil_id"], "FLAK-03")
        self.assertTrue(res["lavt_drivstoff_advarsel"])
        self.assertIn("elbil-skates", res["utstyrskrav"][0])
        self.assertIn("EB99887", res["sjafor_sms"])

    def test_finn_optimal_bergingsressurs_kritisk_drivstoffmangel(self):
        """Edge case: Hvis primærbil har for lite drivstoff for turen, flagges kritisk varsel i SMS og alternativ vurderes."""
        tom_flak_flate = [
            {
                "id": "FLAK-03",
                "modell": "MAN TGL",
                "status": "beredskap",
                "sjafor": "Kjetil S.",
                "drivstoff": {"prosent": 8, "tank_liter": 180, "rekkevidde_km": 35},
                "dekk": {"monsterdybde_mm": 8.0, "minstekrav_mm": 5.0},
                "utstyr_status": {"sertifisert_kranwire": False}
            },
            {
                "id": "TUNG-01",
                "modell": "Scania R580",
                "status": "beredskap",
                "sjafor": "Jan Ove Thygesen",
                "drivstoff": {"prosent": 80, "tank_liter": 600, "rekkevidde_km": 750},
                "dekk": {"monsterdybde_mm": 10.0, "minstekrav_mm": 5.0},
                "utstyr_status": {"sertifisert_kranwire": True}
            }
        ]
        # Oppdrag i Arendal / Harebakken krever tur/retur ca. 45-50 km + buffer
        res = finn_optimal_bergingsressurs(
            hendelse_tekst="Motorstopp personbil E18 Harebakken Arendal",
            posisjon={"lat": 58.4812, "lng": 8.7612},
            kundenavn="Petter Solberg",
            telefon="90123456",
            flate=tom_flak_flate,
            fakta=self.fakta
        )
        self.assertEqual(res["primar_bil_id"], "FLAK-03")
        self.assertFalse(res["drivstoff_tilstrekkelig"])
        self.assertIn("KRITISK DRIVSTOFFVARSEL", res["sjafor_sms"])
        self.assertIsNotNone(res["alternativ_bil"])
        self.assertEqual(res["alternativ_bil"]["id"], "TUNG-01")

    def test_finn_optimal_bergingsressurs_tom_flate(self):
        """Edge case: Hvis flåtelisten er tom, skal systemet håndtere det trygt uten å kaste exception."""
        res = finn_optimal_bergingsressurs(
            hendelse_tekst="Utforkjøring personbil E18",
            posisjon=None,
            flate=[],
            fakta=self.fakta
        )
        self.assertIsNone(res["primar_bil"])
        self.assertFalse(res["bil_operativ"])
        self.assertFalse(res["drivstoff_tilstrekkelig"])

    def test_posisjonering_ugyldige_og_nan_koordinater(self):
        """Edge case: Ugyldige tekststrenger, NaN eller Inf som koordinater skal gi mangler_posisjon."""
        import math
        pos1 = beregn_nodhjelp_posisjon("ugyldig_lat", 8.5, self.fakta)
        self.assertEqual(pos1["status"], "mangler_posisjon")

        pos2 = beregn_nodhjelp_posisjon(float("nan"), 8.5, self.fakta)
        self.assertEqual(pos2["status"], "mangler_posisjon")

        pos3 = beregn_nodhjelp_posisjon(58.3, float("inf"), self.fakta)
        self.assertEqual(pos3["status"], "mangler_posisjon")

    def test_batkalkulator_ugyldig_distanse(self):
        """Edge case: Distanse <= 0 skal avvises som ugyldig."""
        res_null = kalkuler_bat_og_spesialtransport(lengde_fot=20, vekt_tonn=1.5, distanse_km=0)
        self.assertFalse(res_null["gyldig"])
        self.assertIn("positive tall", res_null["feil"])

        res_neg = kalkuler_bat_og_spesialtransport(lengde_fot=20, vekt_tonn=1.5, distanse_km=-15)
        self.assertFalse(res_neg["gyldig"])


if __name__ == "__main__":
    unittest.main(verbosity=2)

