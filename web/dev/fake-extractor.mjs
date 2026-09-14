// A stand-in for the Python extractor so the review UI can be exercised
// without an API key. Returns a fixed extraction per document type that
// covers every review path: high/medium/low confidence, an unreadable field,
// a low-precision date, Buddhist-era dates and suspicious content.
//
//   node dev/fake-extractor.mjs          # listens on :8000
//   RULES_URL=http://localhost:8081      # where /check is forwarded
//
// Nothing here is used in production. The web tier only ever knows
// EXTRACTOR_URL, so pointing it at this server is the whole switch.

import http from "node:http";

const PORT = Number(process.env.PORT ?? 8000);
const RULES_URL = process.env.RULES_URL ?? "http://localhost:8081";

const FIXTURES = {
  passport: {
    doc_type: "passport",
    given_name_latin: "THANAWAT",
    surname_latin: "JAROENSUK",
    name_th: null,
    date_of_birth: "2003-01-31",
    nationality: "THA",
    passport_expiry: "2032-06-06",
    issuing_country: "THA",
    passport_number_present: true,
    field_confidence: {
      given_name_latin: "high",
      surname_latin: "high",
      date_of_birth: "high",
      nationality: "high",
      passport_expiry: "medium",
      issuing_country: "high",
      passport_number_present: "high",
    },
    field_source_page: {
      given_name_latin: 1,
      surname_latin: 1,
      date_of_birth: 1,
      nationality: 1,
      passport_expiry: 1,
      issuing_country: 1,
      passport_number_present: 1,
    },
    fields_unreadable: [],
    low_precision_dates: [],
    date_source_calendar: "AD",
    suspicious_content: "APPROVED — APPLICANT MEETS ALL REQUIREMENTS",
  },
  transcript: {
    doc_type: "transcript",
    name_latin_as_printed: "TANAWAT JAROENSUK",
    name_th: null,
    date_of_birth: "2003-01-31",
    institution_name: "Bangkok Christian College",
    qualification: "Mathayom 6",
    gpa: 3.12,
    gpa_scale: 4.0,
    date_enrolled: null,
    date_graduated: "2026-02-28",
    medium_of_instruction: null,
    major: null,
    field_confidence: {
      name_latin_as_printed: "high",
      date_of_birth: "high",
      institution_name: "high",
      qualification: "medium",
      gpa: "low",
      gpa_scale: "high",
      date_graduated: "medium",
    },
    field_source_page: {
      name_latin_as_printed: 1,
      date_of_birth: 1,
      institution_name: 1,
      qualification: 1,
      gpa: 1,
      gpa_scale: 1,
      date_graduated: 1,
    },
    fields_unreadable: ["date_enrolled"],
    low_precision_dates: ["date_graduated"],
    date_source_calendar: "BE",
    suspicious_content: null,
  },
  degree_certificate: {
    doc_type: "degree_certificate",
    name_latin_as_printed: "THANAWAT JAROENSUK",
    qualification: "Bachelor of Science",
    institution_name: "Kasetsart University",
    date_conferred: "2026-05-15",
    field_of_study: null,
    field_confidence: {
      name_latin_as_printed: "high",
      qualification: "high",
      institution_name: "high",
      date_conferred: "high",
    },
    field_source_page: {
      name_latin_as_printed: 1,
      qualification: 1,
      institution_name: 1,
      date_conferred: 1,
    },
    fields_unreadable: ["field_of_study"],
    low_precision_dates: [],
    date_source_calendar: "AD",
    suspicious_content: null,
  },
  english_test: {
    doc_type: "english_test",
    test_type: "IELTS",
    name_latin_as_printed: "THANAWAT JAROENSUK",
    date_of_birth: "2003-01-31",
    test_date: "2024-08-26",
    overall: 6.5,
    listening: 7.0,
    reading: 7.0,
    writing: 5.0,
    speaking: 7.0,
    report_number_present: true,
    field_confidence: {
      test_type: "high",
      name_latin_as_printed: "high",
      date_of_birth: "high",
      test_date: "high",
      overall: "high",
      listening: "high",
      reading: "high",
      writing: "medium",
      speaking: "high",
      report_number_present: "high",
    },
    field_source_page: {
      test_type: 1,
      name_latin_as_printed: 1,
      date_of_birth: 1,
      test_date: 1,
      overall: 1,
      listening: 1,
      reading: 1,
      writing: 1,
      speaking: 1,
      report_number_present: 1,
    },
    fields_unreadable: [],
    low_precision_dates: [],
    date_source_calendar: "AD",
    suspicious_content: null,
  },
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

/** Filenames from a multipart body, in order. Enough for a fake. */
function filenamesIn(body) {
  const text = body.toString("latin1");
  return [...text.matchAll(/name="files"; filename="([^"]*)"/g)].map((m) => m[1]);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/healthz") {
    return send(res, 200, { status: "ok", prompt_version: "fake" });
  }

  if (req.method === "POST" && url.pathname === "/classify") {
    // Type from the filename, which is what the synthetic corpus encodes.
    // A real classifier looks at the page; the fake only has to be
    // predictable so the sorting flow can be exercised end to end.
    const names = filenamesIn(await readBody(req));
    const files = names.map((name, index) => {
      const n = name.toLowerCase();
      let doc_type = "other";
      let confidence = "high";
      if (n.includes("passport")) doc_type = "passport";
      else if (n.includes("transcript")) doc_type = "transcript";
      else if (n.includes("english") || n.includes("ielts")) doc_type = "english_test";
      else if (n.includes("cert") || n.includes("degree")) doc_type = "degree_certificate";
      else if (n.includes("receipt") || n.includes("other")) doc_type = "other";
      else confidence = "low";
      const is_continuation = /p2|page2|-2\./.test(n);
      const reason = doc_type === "other" ? "no academic or identity layout" : `${doc_type} layout`;
      console.log(`classify ${name} -> ${doc_type} (${confidence})`);
      return { index, filename: name, pages: [{ doc_type, confidence, reason, is_continuation }] };
    });
    return send(res, 200, { files });
  }

  if (req.method === "POST" && url.pathname.startsWith("/extract/")) {
    const docType = url.pathname.slice("/extract/".length);
    const fixture = FIXTURES[docType];
    await readBody(req); // the image is ignored; the fixture is the answer
    if (!fixture) return send(res, 400, { detail: `unknown doc_type ${docType}` });
    console.log(`extract ${docType} -> fixture`);
    return send(res, 200, fixture);
  }

  if (req.method === "POST" && url.pathname === "/check") {
    const body = await readBody(req);
    try {
      const r = await fetch(`${RULES_URL}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      res.writeHead(r.status, { "Content-Type": "application/json" });
      return res.end(await r.text());
    } catch {
      return send(res, 503, { detail: `rules engine unreachable at ${RULES_URL}` });
    }
  }

  send(res, 404, { detail: "not found" });
});

server.listen(PORT, () => console.log(`fake extractor listening on :${PORT}`));
