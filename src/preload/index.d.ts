import type { DernityApi } from "@shared/types";

declare global {
  interface Window {
    dernity: DernityApi;
  }
}
