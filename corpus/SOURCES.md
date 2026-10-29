# Course materials used by BEAR

BEAR searches these materials to ground its hints and cite readings.

## Textbooks (text chunks stored in `books.jsonl`)

The PDFs are not stored here. `books.jsonl` contains text extracted from them by `scripts/extract_books.py`, split into short passages for search. It is shared under the same license as each source.

| Book | Authors | License | Get the book |
|---|---|---|---|
| OpenIntro Statistics, 4th ed. | David Diez, Mine Çetinkaya-Rundel, Christopher Barr | CC BY-SA 3.0 | https://www.openintro.org/book/os/ |
| Introductory Statistics for the Life and Biomedical Sciences | Julie Vu, David Harrington | CC BY-SA 3.0 | https://www.openintro.org/book/biostat/ |
| Online Statistics Education: A Multimedia Course of Study | David M. Lane et al. | Public domain | https://onlinestatbook.com/ |
| An Intuitive, Interactive Introduction to Biostatistics | Caitlin Ward, Collin Nolte | CC BY-NC 4.0 | https://doi.org/10.25820/work.006232 |

Appendices with exercise solutions and distribution tables were left out on purpose.

## Web readings (downloaded at index time, not stored here)

`web_sources.json` lists the pages. The "Build course index" workflow downloads them from their original sites, drops the code blocks, and indexes the text. BEAR links students back to the original pages.

- UCLA OARC, R Data Analysis Examples: logit, mixed effects logistic, multinomial logistic, ordinal logistic, and Poisson regression
- SSCC, University of Wisconsin–Madison: Generalized Linear Models in R
- Regression Modelling for Biostatistics 1 (Stéphane Heritier et al.): chapters 3, 6, 8, 9, 10, 11
- Beyond Multiple Linear Regression (Paul Roback, Julie Legler): all chapters
