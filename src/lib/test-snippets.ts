export type TestSnippet = {
  id: string;
  label: string;
  description: string;
  code: string;
};

export const testSnippets: TestSnippet[] = [
  {
    id: "status-200",
    label: "Status 200",
    description: "Assert HTTP status code is 200",
    code: `pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});`,
  },
  {
    id: "status-2xx",
    label: "Status 2xx",
    description: "Assert response is successful",
    code: `pulse.test("Status is 2xx", function () {
    pulse.response.to.be.ok;
});`,
  },
  {
    id: "response-time",
    label: "Response time",
    description: "Assert response time under 3 seconds",
    code: `pulse.test("Response time is acceptable", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(3000);
});`,
  },
  {
    id: "json-field",
    label: "JSON field",
    description: "Assert a JSON field value",
    code: `pulse.test("Response has expected field", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.id).to.eql("replace-me");
});`,
  },
  {
    id: "body-contains",
    label: "Body contains",
    description: "Assert response body includes text",
    code: `pulse.test("Body contains text", function () {
    pulse.expect(pulse.response.text()).to.include("success");
});`,
  },
  {
    id: "content-type-json",
    label: "JSON header",
    description: "Assert Content-Type header",
    code: `pulse.test("Content-Type is JSON", function () {
    pulse.response.to.have.header("Content-Type");
});`,
  },
  {
    id: "graphql-no-errors",
    label: "GraphQL OK",
    description: "Assert GraphQL response has no errors array entries",
    code: `pulse.test("GraphQL has no errors", function () {
    var jsonData = pulse.response.json();
    pulse.expect(jsonData.errors || []).to.eql([]);
});`,
  },
];

export const pulseTestsTemplate = `// Pulse Tests tab
// Tests run automatically after each request and in collection runner.

pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});

pulse.test("Response time is acceptable", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(3000);
});

// var jsonData = pulse.response.json();
// pulse.test("Has user id", function () {
//     pulse.expect(jsonData.id).to.eql("abc");
// });
`;

/** Converts legacy Postman pm.* scripts to Pulse syntax. */
export function normalizeTestsToPulse(script: string): string {
  return script.replace(/\bpm\./g, "pulse.");
}

/** @deprecated Use pulseTestsTemplate */
export const postmanTestsTemplate = pulseTestsTemplate;
