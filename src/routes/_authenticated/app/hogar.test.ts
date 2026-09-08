import { describe, expect, it } from 'vitest'
import hogarSource from './hogar.tsx?raw'

/**
 * Regression: rendering `<Navigate to="/onboarding">` inside HouseholdPage
 * froze the renderer. TanStack's `<Navigate>` re-fires navigation in a
 * layout effect whenever its props object identity changes; the freeze
 * happened when that navigation re-rendered the still-mounted page
 * repeatedly. The redirect must run imperatively (useEffect + useNavigate).
 */
describe('Hogar page redirect', () => {
  it('imports useNavigate but not the <Navigate> component', () => {
    expect(hogarSource).toMatch(
      /import\s*\{[^}]*useNavigate[^}]*\}\s*from\s*'@tanstack\/react-router'/,
    )
    expect(hogarSource).not.toMatch(/\bNavigate\b/)
  })

  it('redirects to /onboarding via a guarded effect', () => {
    expect(hogarSource).toMatch(/useNavigate\(\)/)
    expect(hogarSource).toMatch(/useEffect\(/)
    expect(hogarSource).toMatch(/navigate\(\{\s*to:\s*'\/onboarding'\s*\}\)/)
    expect(hogarSource).toMatch(/!isLoading && !profile\?\.household_id/)
  })
})
