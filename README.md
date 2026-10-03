Get TIPS data from api.fiscaldata.treasury.gov on outstanding tips bonds
and also retrieve index ratios. Write out in csv

Requires Node.js 22.18 or later (runs the TypeScript source directly) and a
FRED API key in the `FRED_API_KEY` environment variable.

    npm start           # writes tips.csv in the current directory
    npm install && npm run typecheck   # optional: type-check with tsc
