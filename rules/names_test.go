package main

import "testing"

func TestCompareNames(t *testing.T) {
	cases := []struct {
		name     string
		passport string
		other    string
		want     Verdict
	}{
		{"identical", "SUWANNA JAROENSUK", "SUWANNA JAROENSUK", Pass},
		{"title stripped", "MS SUWANNA JAROENSUK", "SUWANNA JAROENSUK", Pass},
		{"order swapped", "SUWANNA JAROENSUK", "JAROENSUK SUWANNA", Pass},
		{"punctuation", "SUWANNA  JAROENSUK.", "SUWANNA JAROENSUK", Pass},

		{"v to w", "SUWANNA", "SUVANNA", Warn},
		{"ph to p", "PHANIT", "PANIT", Warn},
		{"th to t", "THANAWAT", "TANAWAT", Warn},
		{"silent h", "SUKHUMVIT", "SUKUMWIT", Warn},
		{"ee to i", "SIREE", "SIRI", Warn},
		{"oo to u", "BOONMEE", "BUNMI", Warn},
		{"ch to j", "CHAIYA", "JAIYA", Warn},

		{"different person", "SUWANNA JAROENSUK", "KANYARAT SOMBAT", Block},
		{"surname differs", "SUWANNA JAROENSUK", "SUWANNA SOMBAT", Block},
		{"empty other", "SUWANNA", "", Block},
		{"empty passport", "", "SUWANNA", Block},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := CompareNames(c.passport, c.other); got != c.want {
				t.Errorf("CompareNames(%q, %q) = %v, want %v",
					c.passport, c.other, got, c.want)
			}
		})
	}
}
