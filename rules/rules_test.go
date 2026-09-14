package main

import (
	"testing"
	"time"
)

func d(y int, m time.Month, day int) *Date { v := NewDate(y, m, day); return &v }

var now = time.Date(2026, time.September, 10, 0, 0, 0, 0, time.UTC)

func TestR2BuddhistEraIsReportedAsExtractionBug(t *testing.T) {
	c := Case{
		PassportName: "SUWANNA",
		PassportDOB:  d(2004, time.March, 14),
		TranscriptDOB: d(2547, time.March, 14), // BE not converted
	}
	got := Evaluate(c, DefaultConfig(), now)
	r2 := got.Checks[1]

	if r2.Verdict != Block {
		t.Fatalf("R2 verdict = %v, want block", r2.Verdict)
	}
	if !contains(r2.Detail, "543") {
		t.Errorf("R2 should name the 543-year conversion bug, got %q", r2.Detail)
	}
}

func TestR3AllowsThaiConferralGap(t *testing.T) {
	cfg := DefaultConfig()
	tests := []struct {
		name string
		gap  int
		want Verdict
	}{
		{"same day", 0, Pass},
		{"typical Thai gap", 120, Pass},
		{"edge of pass window", 180, Pass},
		{"long gap", 200, Warn},
		{"over a year", 400, Block},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			grad := NewDate(2026, time.March, 31)
			conf := DateFromTime(grad.t().AddDate(0, 0, tc.gap))
			c := Case{TranscriptGradDate: &grad, CertificateGradDate: &conf}
			if got := ruleR3(c, cfg).Verdict; got != tc.want {
				t.Errorf("gap %d days = %v, want %v", tc.gap, got, tc.want)
			}
		})
	}
}

func TestR4NeedsBufferAfterCourseEnd(t *testing.T) {
	cfg := DefaultConfig()
	end := NewDate(2029, time.June, 30)
	tests := []struct {
		name   string
		expiry Date
		want   Verdict
	}{
		{"expires before course ends", NewDate(2029, time.March, 1), Block},
		{"inside buffer", NewDate(2029, time.November, 2), Warn},
		{"clears buffer", NewDate(2030, time.February, 1), Pass},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			e := tc.expiry
			c := Case{PassportExpiry: &e, CourseEndDate: &end}
			if got := ruleR4(c, cfg).Verdict; got != tc.want {
				t.Errorf("expiry %s = %v, want %v", tc.expiry, got, tc.want)
			}
		})
	}
}

func TestR5UsesSubmissionDateNotToday(t *testing.T) {
	cfg := DefaultConfig()
	// Test sat 2024-04-20, so it lapses 2026-04-20 — already past "now",
	// but the rule must judge against the submission target.
	c := Case{
		EnglishTestDate:  d(2024, time.April, 20),
		SubmissionTarget: d(2026, time.February, 1),
	}
	if got := ruleR5(c, cfg, now).Verdict; got != Pass {
		t.Errorf("verdict = %v, want pass: valid on the submission date", got)
	}

	c.SubmissionTarget = d(2026, time.October, 31)
	if got := ruleR5(c, cfg, now).Verdict; got != Block {
		t.Errorf("verdict = %v, want block: lapsed before submission", got)
	}
}

func TestMissingInputIsPendingNotPass(t *testing.T) {
	res := Evaluate(Case{CaseID: "empty"}, DefaultConfig(), now)
	if res.CanProceed {
		t.Error("an empty case must not be allowed to proceed")
	}
	for _, ch := range res.Checks {
		if ch.Status != "pending" {
			t.Errorf("%s status = %q, want pending", ch.RuleID, ch.Status)
		}
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
