import {
  invokeFirstDefined,
  parseOptionalJson,
} from '../components/quant-lab/quantLabActionUtils';

describe('quantLabActionUtils', () => {
  test('parseOptionalJson parses JSON and falls back when the field is empty', () => {
    expect(parseOptionalJson('{"desk":"research"}')).toEqual({ desk: 'research' });
    expect(parseOptionalJson('', { enabled: true })).toEqual({ enabled: true });
    expect(parseOptionalJson(undefined, [])).toEqual([]);
  });

  test('invokeFirstDefined calls the first available callback only', async () => {
    const first = jest.fn().mockResolvedValue(null);
    const second = jest.fn().mockResolvedValue('second');

    await expect(invokeFirstDefined(undefined, first, second)).resolves.toBeNull();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  test('invokeFirstDefined returns null when no callbacks are provided', async () => {
    await expect(invokeFirstDefined(undefined, null, false)).resolves.toBeNull();
  });
});
