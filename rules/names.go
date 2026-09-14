package main

import (
	"regexp"
	"sort"
	"strings"
)

// Verdict is the outcome of a single check.
type Verdict string

const (
	Pass  Verdict = "pass"  // identical after normalisation
	Warn  Verdict = "warn"  // reconcilable, but a human must confirm
	Block Verdict = "block" // not reconcilable, case cannot proceed
)

var (
	nonLetter = regexp.MustCompile(`[^A-Z ]+`)
	multiSpc  = regexp.MustCompile(` +`)
	titles    = map[string]bool{
		"MR": true, "MRS": true, "MS": true, "MISS": true,
		"MASTER": true, "NAI": true, "NANG": true, "NANGSAO": true,
	}
)

// Normalise strips titles, punctuation and case so two spellings can be
// compared as bare letter sequences. Tokens are sorted because documents
// disagree on given-name-first versus surname-first ordering.
func Normalise(s string) string {
	s = strings.ToUpper(s)
	s = nonLetter.ReplaceAllString(s, " ")
	s = multiSpc.ReplaceAllString(s, " ")

	kept := make([]string, 0, 4)
	for _, tok := range strings.Fields(s) {
		if titles[tok] {
			continue
		}
		kept = append(kept, tok)
	}
	sort.Strings(kept)
	return strings.Join(kept, " ")
}

// romanisationRules collapse the spelling choices that Thai-to-Latin
// transliteration leaves open. Applied to both sides before comparison, so
// SUWANNA and SUVANNA fold to the same key.
//
// Order matters: digraphs must fold before single letters.
var romanisationRules = []struct{ from, to string }{
	{"PH", "P"}, {"TH", "T"}, {"KH", "K"}, {"CH", "J"},
	{"OO", "U"}, {"EE", "I"}, {"II", "I"}, {"OU", "U"},
	{"V", "W"}, {"G", "K"}, {"Y", "I"},
}

// FoldRomanisation reduces a normalised name to a spelling-insensitive key.
func FoldRomanisation(s string) string {
	for _, r := range romanisationRules {
		s = strings.ReplaceAll(s, r.from, r.to)
	}
	return collapseDoubles(s)
}

func collapseDoubles(s string) string {
	var b strings.Builder
	var prev rune
	for _, c := range s {
		if c != prev || c == ' ' {
			b.WriteRune(c)
		}
		prev = c
	}
	return b.String()
}

// CompareNames implements rule R1. The passport spelling is authoritative:
// when it disagrees with another document, the other document is what has to
// be reissued, never the value stored in our database.
func CompareNames(passport, other string) Verdict {
	np, no := Normalise(passport), Normalise(other)
	if np == "" || no == "" {
		return Block
	}
	if np == no {
		return Pass
	}
	if FoldRomanisation(np) == FoldRomanisation(no) {
		return Warn
	}
	return Block
}
