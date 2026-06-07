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
    code: `pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});`,
  },
  {
    id: "status-2xx",
    label: "Status 2xx",
    description: "Assert response is successful",
    code: `pm.test("Status is 2xx", function () {
    pm.response.to.be.ok;
});`,
  },
  {
    id: "response-time",
    label: "Response time",
    description: "Assert response time under 3 seconds",
    code: `pm.test("Response time is acceptable", function () {
    pm.expect(pm.response.responseTime).to.be.below(3000);
});`,
  },
  {
    id: "json-field",
    label: "JSON field",
    description: "Assert a JSON field value",
    code: `pm.test("Response has expected field", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.id).to.eql("replace-me");
});`,
  },
  {
    id: "body-contains",
    label: "Body contains",
    description: "Assert response body includes text",
    code: `pm.test("Body contains text", function () {
    pm.expect(pm.response.text()).to.include("success");
});`,
  },
  {
    id: "content-type-json",
    label: "JSON header",
    description: "Assert Content-Type header",
    code: `pm.test("Content-Type is JSON", function () {
    pm.response.to.have.header("Content-Type");
});`,
  },
  {
    id: "graphql-no-errors",
    label: "GraphQL OK",
    description: "Assert GraphQL response has no errors array entries",
    code: `pm.test("GraphQL has no errors", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.errors || []).to.eql([]);
});`,
  },
];

export const postmanTestsTemplate = `// Postman-style Tests tab
// Tests run automatically after each request and in collection runner.

pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response time is acceptable", function () {
    pm.expect(pm.response.responseTime).to.be.below(3000);
});

// var jsonData = pm.response.json();
// pm.test("Has user id", function () {
//     pm.expect(jsonData.id).to.eql("abc");
// });
`;
