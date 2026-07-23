import { onRequestGet as __api_fetch_ts_onRequestGet } from "E:\\AI\\optiweb\\functions\\api\\fetch.ts"
import { onRequestPost as __api_fetch_ts_onRequestPost } from "E:\\AI\\optiweb\\functions\\api\\fetch.ts"

export const routes = [
    {
      routePath: "/api/fetch",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_fetch_ts_onRequestGet],
    },
  {
      routePath: "/api/fetch",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_fetch_ts_onRequestPost],
    },
  ]