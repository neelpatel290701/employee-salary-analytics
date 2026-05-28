import { setupServer } from 'msw/node';

// MSW Node server used by component tests to intercept fetch requests.
// Handlers are deliberately empty here - each test calls server.use() to
// register the responses it needs, so an unmatched request in a test is
// an obvious failure (the test file calls server.listen({
// onUnhandledRequest: 'error' }) so unhandled requests throw).
//
// See docs/06-tdd-strategy.md §4 for why MSW (network-layer interception)
// is preferred over mocking the api client module directly: the component
// under test sees a real fetch, so we test the contract, not the
// implementation.

export const server = setupServer();
