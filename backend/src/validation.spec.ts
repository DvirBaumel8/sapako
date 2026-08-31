import { VALIDATION_PIPE_OPTIONS } from './validation';

/**
 * These three options are the difference between DTO decorators being
 * enforced and being decoration. Nothing else asserts them directly: the
 * e2e tests observe their effects, but only through the pipe this object
 * configures, so a change here would move both the behaviour and the test
 * of it at once.
 */
describe('VALIDATION_PIPE_OPTIONS', () => {
  it('strips properties no DTO declares', () => {
    expect(VALIDATION_PIPE_OPTIONS.whitelist).toBe(true);
  });

  it('refuses a payload carrying undeclared properties', () => {
    // Without this a misspelled field is silently dropped, and the caller
    // sees a 201 for a write that did not store what they sent.
    expect(VALIDATION_PIPE_OPTIONS.forbidNonWhitelisted).toBe(true);
  });

  it('applies the types the DTOs declare', () => {
    expect(VALIDATION_PIPE_OPTIONS.transform).toBe(true);
  });
});
