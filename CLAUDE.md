# Options Flow Dashboard

## Project Overview
Real-time options flow dashboard for active options traders, styled after a Bloomberg terminal dark UI.

## Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **API**: Polygon.io

## Polygon.io API Endpoints
- Options chain snapshot: `GET /v3/snapshot/options/{underlyingAsset}`
- Real-time quotes: `GET /v2/last/nbbo/{ticker}`
- Daily OHLC: `GET /v1/open-close/{ticker}/{date}`
- Options contract details: `GET /v3/snapshot/options/{underlyingAsset}/{optionsTicker}`

## Features Planned
1. **IV Surface** — Implied volatility heatmap/3D chart by strike x expiration
2. **Unusual Options Activity** — Large premium, volume/OI ratio anomalies
3. **Max Pain** — Strike price where options sellers profit most at expiration
4. **Open Interest Heatmap** — Call/put OI by strike and expiration
5. **Large Volume Scanner** — Real-time feed of high-volume options trades

## Design System
- **Theme**: Bloomberg terminal dark
- **Background**: `#0a0a0a`
- **Surface**: `#111111`, `#1a1a1a`
- **Accent**: Orange/amber (`#f59e0b`, `#d97706`)
- **Text**: `#e5e5e5` primary, `#737373` muted
- **Borders**: `#262626`
- **Font**: Monospace for data, sans-serif for labels

## Target Users
Active options traders who need fast, data-dense views of the options market.

## Environment Variables
```
POLYGON_API_KEY=pBPicvhOYKaVWNJRjVudW4tvBlISIkCx
```
