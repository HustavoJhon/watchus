import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSeasonEpisodes, fetchTitleDetails } from '@/lib/tmdb/details'

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('fetchSeasonEpisodes', () => {
  it('normalizes and sorts episodes by number', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          name: ' Temporada 2 ',
          season_number: 2,
          episodes: [
            {
              id: 3,
              name: ' Tercero ',
              overview: 'Fin',
              episode_number: 3,
              season_number: 2,
              air_date: '2021-03-01',
              still_path: '/c.jpg',
              runtime: 50,
            },
            {
              id: 1,
              name: '',
              episode_number: 1,
              season_number: 2,
            },
          ],
        }),
      ),
    )

    const season = await fetchSeasonEpisodes(123, 2)

    expect(season.name).toBe('Temporada 2')
    expect(season.seasonNumber).toBe(2)
    expect(season.episodes.map((episode) => episode.id)).toEqual([1, 3])
    expect(season.episodes[0].name).toBe('Episodio sin título')
    expect(season.episodes[1]).toMatchObject({
      name: 'Tercero',
      stillPath: '/c.jpg',
      runtimeMinutes: 50,
      airDate: '2021-03-01',
    })
  })

  it('requests the right season path', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ season_number: 4, episodes: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchSeasonEpisodes(55, 4)

    const url = new URL(fetchMock.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/3/tv/55/season/4')
  })
})

describe('fetchTitleDetails', () => {
  it('exposes the TV seasons, sorted and labelled', async () => {
    vi.stubEnv('VITE_TMDB_API_KEY', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          name: 'Serie',
          first_air_date: '2020-05-01',
          seasons: [
            {
              id: 20,
              name: 'Temporada 2',
              season_number: 2,
              episode_count: 8,
            },
            {
              id: 10,
              name: '',
              season_number: 0,
              episode_count: 2,
            },
            {
              id: 11,
              name: 'Temporada 1',
              season_number: 1,
              episode_count: 10,
            },
          ],
        }),
      ),
    )

    const details = await fetchTitleDetails(9, 'tv')

    expect(details.seasons.map((season) => season.seasonNumber)).toEqual([
      0, 1, 2,
    ])
    expect(details.seasons[0].name).toBe('Temporada 0')
    expect(details.seasons[2].episodeCount).toBe(8)
  })
})
