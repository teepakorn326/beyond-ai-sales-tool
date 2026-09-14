package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("POST /check", handleCheck)

	addr := ":" + envOr("PORT", "8081")
	log.Printf("rules engine %s listening on %s", RulesetVersion, addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func handleCheck(w http.ResponseWriter, r *http.Request) {
	var c Case
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	res := Evaluate(c, DefaultConfig(), time.Now().UTC())
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
