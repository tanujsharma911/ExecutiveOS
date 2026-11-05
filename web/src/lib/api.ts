/**
 * HTTP layer (axios) with request cancellation.
 *
 * - `api()`      — one request. Pass `signal` to make it cancellable.
 * - `useApi()`   — data hook. Aborts its request when the component unmounts,
 *                  when its path/deps change, or when it refetches.
 * - `useAbortScope()` — for requests started by user actions (generate, submit, …):
 *                  every signal it hands out is aborted when the component unmounts.
 * Aborted requests reject with an error for which `isAbortError()` is true; they
 * never update state or show error messages.
 */
import axios, { AxiosError, type AxiosRequestConfig, type Method } from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/store/auth'
import { useUi } from '@/store/ui'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const http = axios.create({ baseURL: BASE })

http.interceptors.request.use((config) => {
  const token = useAuth.getState().token
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ error?: string }>) => {
    if (axios.isCancel(err)) return Promise.reject(err)
    const status = err.response?.status ?? 0
    if (status === 401 && useAuth.getState().token) useAuth.getState().logout()
    const message = err.response?.data?.error ?? (status ? err.message : 'Network error — is the API running?')
    return Promise.reject(new ApiError(status, message))
  },
)

/** True for requests cancelled via AbortController (component unmounted, navigated away, superseded). */
export function isAbortError(e: unknown): boolean {
  return axios.isCancel(e) || (e instanceof DOMException && e.name === 'AbortError') || (e as { name?: string })?.name === 'CanceledError'
}

export interface ApiOptions {
  method?: Method
  json?: unknown
  params?: AxiosRequestConfig['params']
  signal?: AbortSignal
}

export async function api<T = unknown>(path: string, { method = 'GET', json, params, signal }: ApiOptions = {}): Promise<T> {
  const res = await http.request<T>({ url: path, method, data: json, params, signal })
  return res.data
}

/**
 * Hands out AbortSignals for imperative requests and aborts them all on unmount.
 * `next()` also aborts the previous request from the same scope (useful for "regenerate").
 */
export function useAbortScope() {
  const controllers = useRef(new Set<AbortController>())
  const latest = useRef<AbortController | null>(null)
  useEffect(() => {
    const set = controllers.current
    return () => {
      set.forEach((c) => c.abort())
      set.clear()
    }
  }, [])
  const signal = useCallback(() => {
    const c = new AbortController()
    controllers.current.add(c)
    c.signal.addEventListener('abort', () => controllers.current.delete(c))
    return c.signal
  }, [])
  const abortAll = useCallback(() => {
    controllers.current.forEach((c) => c.abort())
    controllers.current.clear()
  }, [])
  const next = useCallback(() => {
    latest.current?.abort()
    const c = new AbortController()
    latest.current = c
    controllers.current.add(c)
    return c.signal
  }, [])
  return useMemo(() => ({ signal, next, abortAll }), [signal, next, abortAll])
}

/** Data hook: refetches when deps or the global version change; cancels stale requests. */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const version = useUi((s) => s.version)
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    if (!path) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    api<T>(path, { signal: controller.signal })
      .then((d) => {
        setData(d)
        setError(null)
        setLoading(false)
      })
      .catch((e) => {
        if (isAbortError(e)) return // superseded or unmounted: leave state alone
        setError((e as Error).message)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, tick, ...deps])
  return { data, error, loading, reload, setData }
}
