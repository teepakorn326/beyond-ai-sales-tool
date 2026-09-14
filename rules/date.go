package main

import (
	"encoding/json"
	"fmt"
	"time"
)

// Date is a calendar date with no clock and no zone. Using time.Time here
// would invite timezone bugs into rules that are purely about calendar days.
type Date struct {
	Y int
	M time.Month
	D int
}

func NewDate(y int, m time.Month, d int) Date { return Date{y, m, d} }

func DateFromTime(t time.Time) Date {
	y, m, d := t.Date()
	return Date{y, m, d}
}

func (d Date) t() time.Time { return time.Date(d.Y, d.M, d.D, 0, 0, 0, 0, time.UTC) }

func (d Date) String() string { return d.t().Format("2006-01-02") }

func (d Date) Equal(o Date) bool  { return d == o }
func (d Date) Before(o Date) bool { return d.t().Before(o.t()) }
func (d Date) After(o Date) bool  { return d.t().After(o.t()) }

// Sub returns whole days from o to d.
func (d Date) Sub(o Date) int { return int(d.t().Sub(o.t()).Hours() / 24) }

func (d Date) AddMonths(n int) Date { return DateFromTime(d.t().AddDate(0, n, 0)) }
func (d Date) AddYears(n int) Date  { return DateFromTime(d.t().AddDate(n, 0, 0)) }

func yearsApart(a, b Date) int {
	n := a.Y - b.Y
	if n < 0 {
		return -n
	}
	return n
}

func (d Date) MarshalJSON() ([]byte, error) { return json.Marshal(d.String()) }

func (d *Date) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return fmt.Errorf("date must be YYYY-MM-DD, got %q", s)
	}
	*d = DateFromTime(t)
	return nil
}
