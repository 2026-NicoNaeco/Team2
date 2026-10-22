import type { BoardConnection } from '../types';

const modes: Record<NonNullable<BoardConnection['transportMode']>, string> = {
  walk: '도보', transit: '대중교통', car: '자동차', other: '기타',
};

export function connectionText(connection: BoardConnection, fallback: string) {
  if (connection.transportMode || connection.durationMinutes !== undefined) {
    return [connection.transportMode ? modes[connection.transportMode] : '',
      connection.durationMinutes !== undefined ? `${connection.durationMinutes}분` : ''].filter(Boolean).join(' ') || fallback;
  }
  const legacyLabel = connection.label?.trim();
  return legacyLabel && !/^동선\s*\d+$/.test(legacyLabel) ? legacyLabel : connection.description?.trim() || fallback;
}
