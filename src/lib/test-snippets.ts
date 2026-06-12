export type TestSnippet = {
  id: string;
  label: string;
  description: string;
  code: string;
  group: "status" | "headers" | "body" | "json" | "graphql" | "performance";
};

export const testSnippets: TestSnippet[] = [
  {
    id: "status-200",
    label: "Status 200",
    description: "Assert exact HTTP status code",
    group: "status",
    code: `pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});`,
  },
  {
    id: "status-2xx",
    label: "Status 2xx",
    description: "Assert successful response",
    group: "status",
    code: `pulse.test("Status is 2xx", function () {
    pulse.response.to.be.ok;
});`,
  },
  {
    id: "status-not-404",
    label: "Not 404",
    description: "Assert response is not a specific status",
    group: "status",
    code: `pulse.test("Status is not 404", function () {
    pulse.response.to.not.have.status(404);
});`,
  },
  {
    id: "status-4xx",
    label: "Client error",
    description: "Assert 4xx client error response",
    group: "status",
    code: `pulse.test("Returns client error", function () {
    pulse.response.to.be.clientError;
});`,
  },
  {
    id: "status-5xx",
    label: "Server error",
    description: "Assert 5xx server error response",
    group: "status",
    code: `pulse.test("Returns server error", function () {
    pulse.response.to.be.serverError;
});`,
  },
  {
    id: "content-type-json",
    label: "JSON header",
    description: "Assert Content-Type header includes json",
    group: "headers",
    code: `pulse.test("Content-Type is JSON", function () {
    pulse.expect(pulse.response.headers.get("Content-Type")).to.include("json");
});`,
  },
  {
    id: "header-exists",
    label: "Header exists",
    description: "Assert a response header is present",
    group: "headers",
    code: `pulse.test("Has cache header", function () {
    pulse.response.to.have.header("Cache-Control");
});`,
  },
  {
    id: "body-contains",
    label: "Body contains",
    description: "Assert response body includes text",
    group: "body",
    code: `pulse.test("Body contains text", function () {
    pulse.expect(pulse.response.text()).to.include("success");
});`,
  },
  {
    id: "body-regex",
    label: "Body regex",
    description: "Assert body matches a regular expression",
    group: "body",
    code: `pulse.test("Body matches UUID pattern", function () {
    pulse.expect(pulse.response.text()).to.match(/[0-9a-f-]{36}/);
});`,
  },
  {
    id: "body-not-empty",
    label: "Body not empty",
    description: "Assert response body is not empty",
    group: "body",
    code: `pulse.test("Body is not empty", function () {
    pulse.expect(pulse.response.text()).to.not.be.empty;
});`,
  },
  {
    id: "json-field",
    label: "JSON field",
    description: "Assert a JSON field equals a value",
    group: "json",
    code: `pulse.test("Response has expected field", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.id).to.eql("replace-me");
});`,
  },
  {
    id: "json-nested",
    label: "Nested JSON",
    description: "Assert nested JSON path value",
    group: "json",
    code: `pulse.test("Nested user id exists", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.data.user.id).to.be.a("number");
});`,
  },
  {
    id: "json-array-length",
    label: "Array length",
    description: "Assert JSON array has expected length",
    group: "json",
    code: `pulse.test("Items array length", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.items).to.have.lengthOf(3);
});`,
  },
  {
    id: "json-property",
    label: "Has property",
    description: "Assert object has a property",
    group: "json",
    code: `pulse.test("Response has email field", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData).to.have.property("email");
});`,
  },
  {
    id: "json-type-array",
    label: "Is array",
    description: "Assert value is a JSON array",
    group: "json",
    code: `pulse.test("Results is an array", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.results).to.be.an("array");
});`,
  },
  {
    id: "graphql-no-errors",
    label: "GraphQL OK",
    description: "Assert GraphQL response has no errors",
    group: "graphql",
    code: `pulse.test("GraphQL has no errors", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.errors || []).to.eql([]);
});`,
  },
  {
    id: "graphql-data-exists",
    label: "GraphQL data",
    description: "Assert GraphQL data object exists",
    group: "graphql",
    code: `pulse.test("GraphQL returns data", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.data).to.be.an("object");
    pulse.expect(jsonData.data).to.not.be.empty;
});`,
  },
  {
    id: "response-time",
    label: "Response time",
    description: "Assert response time under 3 seconds",
    group: "performance",
    code: `pulse.test("Response time is acceptable", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(3000);
});`,
  },
  {
    id: "body-size",
    label: "Body size",
    description: "Assert response body size limit",
    group: "performance",
    code: `pulse.test("Body size is reasonable", function () {
    pulse.expect(pulse.response.size()).to.be.below(100000);
});`,
  },
  {
    id: "status-range",
    label: "Status range",
    description: "Assert status code via pulse.expect",
    group: "status",
    code: `pulse.test("Status is 201 Created", function () {
    pulse.expect(pulse.response.code).to.eql(201);
});`,
  },
];

export const pulseTestApiReference = [
  {
    title: "Test blocks",
    items: [
      'pulse.test("name", function () { ... })',
      "pm.test(...) is auto-converted to pulse.test",
      "JSON array assertions are also supported",
    ],
  },
  {
    title: "Response shortcuts",
    items: [
      "pulse.response.to.have.status(200)",
      "pulse.response.to.not.have.status(404)",
      "pulse.response.to.be.ok · clientError · serverError · redirect",
      'pulse.response.to.have.header("Header-Name")',
      'pulse.response.to.have.header("Content-Type", "json")',
      "pulse.response.code · responseTime · text() · json() · size()",
      'pulse.response.headers.get("Content-Type")',
    ],
  },
  {
    title: "Expect matchers",
    items: [
      "pulse.expect(value).to.eql(expected)",
      "pulse.expect(value).to.not.eql(expected)",
      "pulse.expect(value).to.include('text')",
      "pulse.expect(value).to.be.above(n) · below(n) · at.least(n) · at.most(n)",
      "pulse.expect(value).to.be.true · false · null · undefined · empty",
      'pulse.expect(value).to.be.an("array") · "object" · "string" · "number"',
      'pulse.expect(obj).to.have.property("key")',
      "pulse.expect(array).to.have.lengthOf(n)",
      "pulse.expect(text).to.match(/regex/)",
    ],
  },
  {
    title: "JSON variables",
    items: [
      "var jsonData = pulse.response.json();",
      "pulse.expect(jsonData.id).to.eql(42)",
      "pulse.expect(jsonData.user.name).to.eql('Ada')",
      "pulse.expect(jsonData.items[0].id).to.be.a('number')",
      "pulse.expect(jsonData.errors || []).to.eql([])",
    ],
  },
];

export const pulseTestsTemplate = `// Pulse test script
// Send the request first, then click Run tests.

pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});

pulse.test("Response time is acceptable", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(3000);
});

// --- JSON example ---
// var jsonData = pulse.response.json();
// pulse.test("Has user id", function () {
//     pulse.expect(jsonData.id).to.be.a("number");
//     pulse.expect(jsonData.email).to.include("@");
// });

// --- GraphQL example ---
// pulse.test("GraphQL has no errors", function () {
//     var jsonData = pulse.response.json();
//     pulse.expect(jsonData.errors || []).to.eql([]);
// });

// --- JSON assertions array (alternative syntax) ---
// [
//   {"name":"Status ok","assertion":"status","expected":200},
//   {"name":"Has slug","assertion":"jsonPath","path":"slug","expected":"demo"},
//   {"name":"Fast","assertion":"responseTime","maxMs":500}
// ]
`;

/** Converts legacy Postman pm.* scripts to Pulse syntax. */
export function normalizeTestsToPulse(script: string): string {
  return script.replace(/\bpm\./g, "pulse.");
}

/** @deprecated Use pulseTestsTemplate */
export const postmanTestsTemplate = pulseTestsTemplate;

export function snippetsByGroup() {
  const groups = [
    { title: "Status", key: "status" as const },
    { title: "Headers", key: "headers" as const },
    { title: "Body", key: "body" as const },
    { title: "JSON", key: "json" as const },
    { title: "GraphQL", key: "graphql" as const },
    { title: "Performance", key: "performance" as const },
  ];

  return groups
    .map((group) => ({
      title: group.title,
      items: testSnippets.filter((snippet) => snippet.group === group.key),
    }))
    .filter((group) => group.items.length > 0);
}
