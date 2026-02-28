const { validateApiKey } = require('./auth');

function makeReqRes(headerValue) {
  const req = { headers: { 'x-api-key': headerValue } };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('validateApiKey', () => {
  const REAL_KEY = 'test-secret-key-abc123';

  beforeEach(() => {
    process.env.API_KEY = REAL_KEY;
  });

  afterEach(() => {
    delete process.env.API_KEY;
  });

  it('calls next() when API key matches', () => {
    const { req, res, next } = makeReqRes(REAL_KEY);
    validateApiKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('returns 401 when API key is wrong', () => {
    const { req, res, next } = makeReqRes('wrong-key');
    validateApiKey(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when API key is missing', () => {
    const { req, res, next } = makeReqRes(undefined);
    validateApiKey(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
