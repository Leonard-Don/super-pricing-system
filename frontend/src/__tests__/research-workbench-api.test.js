const mockPost = jest.fn();

jest.mock('axios', () => ({
  create: jest.fn(() => ({
    post: mockPost,
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
  isCancel: jest.fn(() => false),
}));

describe('research workbench api helpers', () => {
  beforeEach(() => {
    mockPost.mockClear();
  });

  it('exports the screener task helper from the services api directory barrel', () => {
    const { createResearchTasksFromScreener } = require('../services/api/index');

    expect(createResearchTasksFromScreener).toEqual(expect.any(Function));
  });

  it('creates research tasks from pricing screener candidates', async () => {
    const responsePayload = {
      success: true,
      total: 1,
      data: [{ id: 'rw_1', symbol: 'AAPL', source: 'screener' }],
    };
    const payload = {
      source: 'screener',
      candidates: [
        {
          symbol: 'AAPL',
          company_name: 'Apple Inc',
          primary_view: '低估',
          screening_score: 0.82,
        },
      ],
    };
    mockPost.mockResolvedValueOnce({ data: responsePayload });

    const { API_TIMEOUT_PROFILES, createResearchTasksFromScreener } = require('../services/api');

    await expect(createResearchTasksFromScreener(payload)).resolves.toEqual(responsePayload);
    expect(mockPost).toHaveBeenCalledWith(
      '/research-workbench/tasks/from-screener',
      payload,
      expect.objectContaining({ timeout: API_TIMEOUT_PROFILES.workbench }),
    );
  });
});
