import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from naf_arendal_ai import (
    beregn_servicepris,
    diagnostiser_feilkode_obd2,
    evaluer_pkk_mangel,
    finn_bildeler_ai,
    last_fakta,
    sla_opp_kjoretoy,
    valider_og_normaliser_regnr,
)


class TestNafSenterArendalAI(unittest.TestCase):
    def setUp(self):
        self.fakta = last_fakta()

    def test_fakta_struktur_og_arendal_data(self):
        """Verifiser at NAF Senter Arendal har reelle data og adresse i Åsbieveien 14."""
        self.assertEqual(self.fakta["senter_navn"], "NAF Senter Arendal")
        self.assertEqual(self.fakta["adresse"], "Åsbieveien 14")
        self.assertEqual(self.fakta["postnummer"], "4848")
        self.assertEqual(self.fakta["poststed"], "Arendal")
        self.assertIn("Stoa", self.fakta["beliggenhet"])
        self.assertEqual(self.fakta["telefon_felles"], "08505")
        self.assertGreaterEqual(len(self.fakta["tjenester"]), 6)
        self.assertGreaterEqual(len(self.fakta["deleleverandorer_arendal"]), 3)

    def test_validering_og_normalisering_regnr(self):
        """Tester at regnr normaliseres og ugyldige avvises."""
        self.assertEqual(valider_og_normaliser_regnr("ek 12345"), "EK12345")
        self.assertEqual(valider_og_normaliser_regnr("EV-98765"), "EV98765")
        self.assertEqual(valider_og_normaliser_regnr("bt.44321"), "BT44321")
        self.assertIsNone(valider_og_normaliser_regnr("ugyldig123"))
        self.assertIsNone(valider_og_normaliser_regnr(""))

    def test_elbil_deteksjon_og_kontrollmaned(self):
        """Elbilskilt (EK) skal flagge elbil og kontrollmåned etter siste siffer."""
        res = sla_opp_kjoretoy("EK 12345")
        self.assertTrue(res["gyldig"])
        self.assertTrue(res["er_elbil"])
        self.assertIn("Elektrisk", res["drivlinje"])
        self.assertEqual(res["kontrollmåned"], "Mai")  # siste siffer 5 = mai
        self.assertIn("Aviloo", res["anbefalt_test"])

        # Fossilbil (BT) siste siffer 0 = oktober
        fossil = sla_opp_kjoretoy("BT 99880")
        self.assertTrue(fossil["gyldig"])
        self.assertFalse(fossil["er_elbil"])
        self.assertEqual(fossil["kontrollmåned"], "Oktober")

    def test_delesok_ai_bremser_og_meca_stoa(self):
        """Bremser skal rutes til Meca Arendal på Stoa med ~25 min budtid."""
        res = finn_bildeler_ai("Bremsekosser og skiver foran slitt", "EK 12345")
        self.assertTrue(res["funnet"])
        self.assertIn("Brembo", res["oem_referanse"])
        self.assertIn("Meca Arendal", res["grossist"])
        self.assertEqual(res["budtid_minutter"], 25)
        self.assertIn("Åsbieveien 14", res["bestillingsordre_tekst"])

    def test_delesok_ai_dpf_sensor(self):
        """DPF-feil skal finne differansetrykksensor hos Romnes Agder."""
        res = finn_bildeler_ai("Partikkelfilter differansetrykk feil")
        self.assertTrue(res["funnet"])
        self.assertIn("Differansetrykksensor", res["komponent"])
        self.assertIn("Romnes", res["grossist"])

    def test_obd2_feilkodetriage_p0420(self):
        """P0420 katalysatorfeil skal gi Grad 2 på PKK og konkrete måletiltak."""
        res = diagnostiser_feilkode_obd2("P0420")
        self.assertTrue(res["funnet"])
        self.assertEqual(res["kode"], "P0420")
        self.assertIn("Katalysatoreffektivitet", res["tittel"])
        self.assertIn("Grad 2", res["pkk_vurdering"])

    def test_obd2_feilkodetriage_elbil_p0a80(self):
        """P0A80 hybrid/elbil batterifeil skal anbefale Aviloo SoH test."""
        res = diagnostiser_feilkode_obd2("P0A80")
        self.assertTrue(res["funnet"])
        self.assertIn("Aviloo", res["mekaniker_tiltak"])

    def test_pkk_evaluer_feilgrader(self):
        """Tester Statens vegvesen mangelgrader (1, 2 og 3)."""
        g1 = evaluer_pkk_mangel("Skiltlys", "Pære defekt høyre side")
        self.assertEqual(g1["grad"], 1)
        self.assertTrue(g1["pkk_godkjent"])

        g2 = evaluer_pkk_mangel("Bremser", "Bremseskiver slitt under minstemål")
        self.assertEqual(g2["grad"], 2)
        self.assertFalse(g2["pkk_godkjent"])
        self.assertIn("2 måneder", g2["krav_til_etterkontroll"])

        g3 = evaluer_pkk_mangel("Bremser", "Akutt bremsesvikt pedal i bunn")
        self.assertEqual(g3["grad"], 3)
        self.assertFalse(g3["pkk_godkjent"])
        self.assertIn("KJØREFORBUD", g3["betydning"])

    def test_beregn_servicepris_og_medlemsrabatt(self):
        """Tester at NAF-medlemmer får rabatt iht. offisiell prisliste."""
        eu_medlem = beregn_servicepris("eu_kontroll", er_medlem=True)
        self.assertTrue(eu_medlem["gyldig"])
        self.assertEqual(eu_medlem["gjeldende_pris_kr"], 1195)
        self.assertEqual(eu_medlem["medlemsrabatt_kr"], 255)

        eu_ikke_medlem = beregn_servicepris("eu_kontroll", er_medlem=False)
        self.assertEqual(eu_ikke_medlem["gjeldende_pris_kr"], 1450)


if __name__ == "__main__":
    unittest.main(verbosity=2)
