# Manual eBay Import

This project includes a local JavaScript helper at [tools/parse-ebay-sold-html.mjs](C:/Users/blee9/coding/braden_githubio/doublehitcollectibles.githubio.io/tools/parse-ebay-sold-html.mjs) for parsing manually saved eBay sold-results pages.

It does **not** fetch from eBay directly. Instead, it reads one or more HTML files you already saved locally and turns them into a pricing summary with:

- `market_price`
- `average_price`
- `median_price`
- `trimmed_mean_price`
- the filtered sold comps used to calculate those numbers

## Example

```bash
node tools/parse-ebay-sold-html.mjs "mewtwo 281" "C:\path\to\ebay-sold-page-1.html" "C:\path\to\ebay-sold-page-2.html" --out "C:\path\to\mewtwo-281.json"
```

## Notes

- The script filters obvious noise like lots, proxies, playmats, and other unrelated items.
- Raw-card searches exclude graded listings by default.
- Use `--include-graded` if you want those comps included.
- Use multiple saved pages if you want a deeper sold history before trimming down to the most recent `20`.
