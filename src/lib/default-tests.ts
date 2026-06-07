export {
  pulseTestsTemplate as requestTestsPlaceholder,
  pulseTestsTemplate,
  testSnippets,
} from "./test-snippets";

export const defaultRequestTests = `pulse.test("Status code is 200", function () {
    pulse.response.to.have.status(200);
});

pulse.test("Response time is acceptable", function () {
    pulse.expect(pulse.response.responseTime).to.be.below(3000);
});
`;
