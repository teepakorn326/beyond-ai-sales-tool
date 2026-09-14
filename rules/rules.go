package main

import (
	"fmt"
	"time"
)

// Case is everything the rules engine needs. Note what is absent: no student
// name in Thai, no ID number, no address, no free text. The engine works on
// dates and Latin-script names only.
type Case struct {
	CaseID string `json:"case_id"`

	PassportName   string `json:"passport_name"`
	PassportDOB    *Date  `json:"passport_dob"`
	PassportExpiry *Date  `json:"passport_expiry"`

	TranscriptName      string `json:"transcript_name"`
	TranscriptDOB       *Date  `json:"transcript_dob"`
	TranscriptGradDate  *Date  `json:"transcript_grad_date"`
	CertificateGradDate *Date  `json:"certificate_grad_date"`

	EnglishTestName *string `json:"english_test_name"`
	EnglishTestDOB  *Date   `json:"english_test_dob"`
	EnglishTestDate *Date   `json:"english_test_date"`

	CourseEndDate    *Date `json:"course_end_date"`
	SubmissionTarget *Date `json:"submission_target"`
}

// Config holds the thresholds. They live here rather than as constants so the
// business can tune them without a code change, and so the eval suite can
// prove what each threshold costs.
type Config struct {
	PassportBufferMonths int `json:"passport_buffer_months"`
	EnglishValidYears    int `json:"english_valid_years"`
	EnglishWarnDays      int `json:"english_warn_days"`
	GradDatePassDays     int `json:"grad_date_pass_days"`
	GradDateWarnDays     int `json:"grad_date_warn_days"`
}

func DefaultConfig() Config {
	return Config{
		PassportBufferMonths: 6,
		EnglishValidYears:    2,
		EnglishWarnDays:      60,
		GradDatePassDays:     180,
		GradDateWarnDays:     365,
	}
}

type Check struct {
	RuleID  string  `json:"rule_id"`
	Label   string  `json:"label"`
	Verdict Verdict `json:"verdict"`
	Status  string  `json:"status"` // ok | failed | pending
	Detail  string  `json:"detail"`
}

type Result struct {
	CaseID      string  `json:"case_id"`
	CanProceed  bool    `json:"can_proceed"`
	RulesetVer  string  `json:"ruleset_version"`
	Checks      []Check `json:"checks"`
	CheckedAtMs int64   `json:"checked_at_ms"`
}

const RulesetVersion = "block-v1"

// Evaluate runs every rule. A missing input yields "pending", never a silent
// pass: an unchecked rule must never look like a cleared one.
func Evaluate(c Case, cfg Config, now time.Time) Result {
	checks := []Check{
		ruleR1(c),
		ruleR2(c),
		ruleR3(c, cfg),
		ruleR4(c, cfg),
		ruleR5(c, cfg, now),
	}

	canProceed := true
	for _, ch := range checks {
		if ch.Verdict == Block || ch.Status == "pending" {
			canProceed = false
		}
	}

	return Result{
		CaseID:      c.CaseID,
		CanProceed:  canProceed,
		RulesetVer:  RulesetVersion,
		Checks:      checks,
		CheckedAtMs: now.UnixMilli(),
	}
}

func pending(id, label, why string) Check {
	return Check{RuleID: id, Label: label, Verdict: Warn, Status: "pending", Detail: why}
}

// R1 — Latin name matches across every document that carries one.
func ruleR1(c Case) Check {
	const id, label = "R1", "ชื่อภาษาอังกฤษตรงกันทุกเอกสาร"
	if c.PassportName == "" {
		return pending(id, label, "ยังไม่มีพาสปอร์ต")
	}

	worst, detail := Pass, "ตรงกันทุกฉบับ"
	compare := func(docName, other string) {
		if other == "" {
			return
		}
		switch CompareNames(c.PassportName, other) {
		case Block:
			worst = Block
			detail = fmt.Sprintf("%s สะกดต่างจากพาสปอร์ตจนเทียบไม่ได้", docName)
		case Warn:
			if worst != Block {
				worst = Warn
				detail = fmt.Sprintf("%s สะกดต่างจากพาสปอร์ตแบบที่พบในการถอดเสียงไทย ต้องให้คนยืนยัน", docName)
			}
		}
	}
	compare("transcript", c.TranscriptName)
	if c.EnglishTestName != nil {
		compare("ใบคะแนนภาษา", *c.EnglishTestName)
	}

	return Check{id, label, worst, statusOf(worst), detail}
}

// R2 — date of birth identical everywhere. A 543-year gap is a Buddhist-era
// conversion bug in extraction, not a data conflict, and is reported as such
// so nobody chases the student for a corrected document.
func ruleR2(c Case) Check {
	const id, label = "R2", "วันเกิดตรงกันทุกเอกสาร"
	if c.PassportDOB == nil {
		return pending(id, label, "ยังไม่มีพาสปอร์ต")
	}

	others := map[string]*Date{
		"transcript":  c.TranscriptDOB,
		"ใบคะแนนภาษา": c.EnglishTestDOB,
	}
	for name, d := range others {
		if d == nil {
			continue
		}
		if d.Equal(*c.PassportDOB) {
			continue
		}
		if yearsApart(*c.PassportDOB, *d) == 543 {
			return Check{id, label, Block, "failed",
				fmt.Sprintf("%s ต่างกันพอดี 543 ปี เป็นปัญหาการแปลง พ.ศ. ในขั้นสกัด ให้สกัดใหม่ ไม่ต้องขอเอกสารใหม่", name)}
		}
		return Check{id, label, Block, "failed",
			fmt.Sprintf("วันเกิดใน %s ไม่ตรงกับพาสปอร์ต", name)}
	}
	return Check{id, label, Pass, "ok", "ตรงกันทุกฉบับ"}
}

// R3 — graduation date on the transcript versus the degree certificate. The
// generous window exists because in Thailand the completion date and the
// conferral date are routinely months apart; a stricter rule would flag almost
// every case and teach staff to ignore the flag.
func ruleR3(c Case, cfg Config) Check {
	const id, label = "R3", "วันจบตรงกันระหว่าง transcript กับใบปริญญา"
	if c.TranscriptGradDate == nil || c.CertificateGradDate == nil {
		return pending(id, label, "ยังไม่ได้รับเอกสารครบทั้งสองฉบับ")
	}

	diff := c.CertificateGradDate.Sub(*c.TranscriptGradDate)
	switch {
	case diff < 0:
		return Check{id, label, Block, "failed", "ใบปริญญาลงวันที่ก่อน transcript"}
	case diff <= cfg.GradDatePassDays:
		return Check{id, label, Pass, "ok", fmt.Sprintf("ห่างกัน %d วัน อยู่ในเกณฑ์ปกติ", diff)}
	case diff <= cfg.GradDateWarnDays:
		return Check{id, label, Warn, "ok", fmt.Sprintf("ห่างกัน %d วัน ควรตรวจสอบ", diff)}
	default:
		return Check{id, label, Block, "failed", fmt.Sprintf("ห่างกัน %d วัน เกินหนึ่งปี", diff)}
	}
}

// R4 — passport must outlast the course. Checked from the assessment stage,
// not the visa stage: renewing a passport takes weeks, and finding out late
// costs an intake.
func ruleR4(c Case, cfg Config) Check {
	const id, label = "R4", "พาสปอร์ตครอบคลุมถึงจบหลักสูตร"
	if c.PassportExpiry == nil || c.CourseEndDate == nil {
		return pending(id, label, "ยังไม่มีพาสปอร์ตหรือยังไม่ได้เลือกหลักสูตร")
	}

	need := c.CourseEndDate.AddMonths(cfg.PassportBufferMonths)
	switch {
	case c.PassportExpiry.Before(*c.CourseEndDate):
		return Check{id, label, Block, "failed", "พาสปอร์ตหมดอายุก่อนจบหลักสูตร"}
	case c.PassportExpiry.Before(need):
		return Check{id, label, Warn, "ok",
			fmt.Sprintf("เหลือระยะเผื่อไม่ถึง %d เดือนหลังจบหลักสูตร", cfg.PassportBufferMonths)}
	default:
		return Check{id, label, Pass, "ok", "ครอบคลุมพร้อมระยะเผื่อ"}
	}
}

// R5 — the English test must still be valid on the day of submission, not on
// the day we happen to run this check.
func ruleR5(c Case, cfg Config, now time.Time) Check {
	const id, label = "R5", "ผลสอบภาษายังไม่หมดอายุ ณ วันยื่น"
	if c.EnglishTestDate == nil {
		return pending(id, label, "ยังไม่มีผลสอบภาษา")
	}

	expires := c.EnglishTestDate.AddYears(cfg.EnglishValidYears)
	target := DateFromTime(now)
	if c.SubmissionTarget != nil {
		target = *c.SubmissionTarget
	}

	switch {
	case !expires.After(target):
		return Check{id, label, Block, "failed",
			fmt.Sprintf("หมดอายุ %s ก่อนวันยื่นเป้าหมาย %s", expires, target)}
	case expires.Sub(target) <= cfg.EnglishWarnDays:
		return Check{id, label, Warn, "ok",
			fmt.Sprintf("เหลืออีก %d วันก่อนหมดอายุ", expires.Sub(target))}
	default:
		return Check{id, label, Pass, "ok", fmt.Sprintf("ใช้ได้ถึง %s", expires)}
	}
}

func statusOf(v Verdict) string {
	if v == Block {
		return "failed"
	}
	return "ok"
}
