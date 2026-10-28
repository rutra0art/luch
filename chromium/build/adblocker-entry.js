// Точка входа для сборки движка Ghostery в ui/adblocker.js (npm run build:adblocker)
import { FiltersEngine, Request, adsLists, adsAndTrackingLists, fullLists } from '@ghostery/adblocker';
import { parse } from 'tldts-experimental';

window.LuchAdblocker = { FiltersEngine, Request, adsLists, adsAndTrackingLists, fullLists, parse };
