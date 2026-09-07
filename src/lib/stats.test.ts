import { describe, expect, it } from 'vitest'
import {
  computeCatalogStats,
  computeRatingDistribution,
  computeStats,
  computeTopGenres,
  computeUserStats,
} from '@/lib/stats'
import { makeItem, makeReview, makeTitle } from '@/lib/testing'

const members = [
  { id: 'u1', displayName: 'Jhon' },
  { id: 'u2', displayName: 'Ella' },
]

describe('computeCatalogStats', () => {
  it('classifies totals, movies vs series and per-status counts', () => {
    const items = [
      makeItem({
        title: makeTitle({ media_type: 'movie', tmdb_id: 1 }),
        ownStatus: 'watched',
        ownRating: 4.5,
        ownFavorite: true,
      }),
      makeItem({
        title: makeTitle({ media_type: 'tv', tmdb_id: 2 }),
        ownStatus: 'watching',
      }),
      makeItem({
        title: makeTitle({ media_type: 'movie', tmdb_id: 3 }),
        ownStatus: 'watchlist',
      }),
      makeItem({
        title: makeTitle({ media_type: 'movie', tmdb_id: 4 }),
      }),
    ]

    const stats = computeCatalogStats(items)
    expect(stats.total).toBe(4)
    expect(stats.movies).toBe(3)
    expect(stats.series).toBe(1)
    expect(stats.watchlist).toBe(1)
    expect(stats.watching).toBe(1)
    expect(stats.watched).toBe(1)
    expect(stats.favorites).toBe(1)
    expect(stats.rated).toBe(1)
  })

  it('counts watched-by-both only when both members watched', () => {
    const items = [
      makeItem({
        title: makeTitle({ tmdb_id: 1 }),
        ownStatus: 'watched',
        partnerStatus: 'watched',
      }),
      makeItem({
        title: makeTitle({ tmdb_id: 2 }),
        ownStatus: 'watched',
        partnerStatus: 'watchlist',
      }),
    ]
    expect(computeCatalogStats(items).watchedByBoth).toBe(1)
  })

  it('returns zeroed stats for an empty catalog', () => {
    const stats = computeCatalogStats([])
    expect(stats).toEqual({
      total: 0,
      movies: 0,
      series: 0,
      watchlist: 0,
      watching: 0,
      watched: 0,
      favorites: 0,
      rated: 0,
      watchedByBoth: 0,
    })
  })
})

describe('computeUserStats', () => {
  it('computes average rating out of rated titles only', () => {
    const items = [
      makeItem({ title: makeTitle({ tmdb_id: 1 }), ownRating: 4 }),
      makeItem({ title: makeTitle({ tmdb_id: 2 }), ownRating: 5 }),
      makeItem({ title: makeTitle({ tmdb_id: 3 }), ownRating: null }),
    ]
    const user = computeUserStats(items, [], 'u1', 'Jhon')
    expect(user.rated).toBe(2)
    expect(user.avgRating).toBe(4.5)
  })

  it('returns null average when nothing is rated', () => {
    const user = computeUserStats([makeItem()], [], 'u1', 'Jhon')
    expect(user.rated).toBe(0)
    expect(user.avgRating).toBeNull()
  })

  it('counts watched and personal reviews per user', () => {
    const reviewA = makeReview('u1', 'title-1')
    const reviewB = makeReview('u2', 'title-2')
    const items = [
      makeItem({ title: makeTitle({ tmdb_id: 1 }), ownStatus: 'watched' }),
      makeItem({ title: makeTitle({ tmdb_id: 2 }) }),
    ]
    const jhon = computeUserStats(items, [reviewA, reviewB], 'u1', 'Jhon')
    const ella = computeUserStats(items, [reviewA, reviewB], 'u2', 'Ella')
    expect(jhon.watched).toBe(1)
    expect(jhon.reviews).toBe(1)
    expect(ella.reviews).toBe(1)
  })
})

describe('computeRatingDistribution', () => {
  it('buckets ratings by half-star value ascending', () => {
    const items = [
      makeItem({ title: makeTitle({ tmdb_id: 1 }), ownRating: 4.5 }),
      makeItem({ title: makeTitle({ tmdb_id: 2 }), ownRating: 4.5 }),
      makeItem({ title: makeTitle({ tmdb_id: 3 }), ownRating: 2 }),
      makeItem({ title: makeTitle({ tmdb_id: 4 }), ownRating: null }),
    ]
    const distribution = computeRatingDistribution(items)
    expect(distribution).toEqual([
      { value: 2, count: 1 },
      { value: 4.5, count: 2 },
    ])
  })
})

describe('computeTopGenres', () => {
  it('counts genres only from titles watched by anyone', () => {
    const items = [
      makeItem({
        title: makeTitle({
          tmdb_id: 1,
          genres: ['Drama', 'Sci-Fi'],
        }),
        ownStatus: 'watched',
      }),
      makeItem({
        title: makeTitle({ tmdb_id: 2, genres: ['Drama'] }),
        partnerStatus: 'watched',
      }),
      makeItem({
        title: makeTitle({ tmdb_id: 3, genres: ['Comedia'] }),
        ownStatus: 'watchlist',
      }),
    ]
    const genres = computeTopGenres(items, 5)
    expect(genres).toEqual([
      { genre: 'Drama', count: 2 },
      { genre: 'Sci-Fi', count: 1 },
    ])
  })
})

describe('computeStats', () => {
  it('derives everything in one pass and resolves display names', () => {
    const items = [
      makeItem({
        title: makeTitle({ tmdb_id: 1, genres: ['Drama'] }),
        ownStatus: 'watched',
        partnerStatus: 'watched',
        ownRating: 4,
      }),
      makeItem({
        title: makeTitle({ tmdb_id: 2, media_type: 'tv' }),
        ownRating: 3.5,
      }),
    ]
    const reviews = [
      makeReview('u1', 'title-1'),
      makeReview('u1', 'title-2'),
      makeReview('u2', 'title-1'),
    ]
    const stats = computeStats(items, reviews, members, 'u1')

    expect(stats.users).toEqual([
      {
        userId: 'u1',
        displayName: 'Jhon',
        watched: 1,
        rated: 2,
        avgRating: 3.8,
        reviews: 2,
      },
      {
        userId: 'u2',
        displayName: 'Ella',
        watched: 1,
        rated: 0,
        avgRating: null,
        reviews: 1,
      },
    ])
    expect(stats.catalog.watchedByBoth).toBe(1)
    expect(stats.moviesWatched).toBe(1)
    expect(stats.seriesWatched).toBe(0)
    expect(stats.topGenres).toEqual([{ genre: 'Drama', count: 1 }])
    expect(stats.ratingDistribution).toEqual([
      { value: 3.5, count: 1 },
      { value: 4, count: 1 },
    ])
  })
})
