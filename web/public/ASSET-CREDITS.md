# Asset and data credits

All photographs are **illustrative stock photographs**, not photographs of the fictional listings. No association with a sale, owner or agent is implied. Downloaded on 9 October 2026 under the [Pexels License](https://www.pexels.com/license/). Local images were requested at 960px width from Pexels.

| Local asset        | Photographer      | Source                                                                       |
| ------------------ | ----------------- | ---------------------------------------------------------------------------- |
| images/stone.jpg   | Lydia Griva       | [Stone house in a Greek village](https://www.pexels.com/photo/32900236/)     |
| images/garden.jpg  | kwnos Iv          | [Rustic house and garden](https://www.pexels.com/photo/16785234/)            |
| images/village.jpg | Marina Gr         | [Stone houses on a Greek hillside](https://www.pexels.com/photo/18120681/)   |
| images/olive.jpg   | Petra Nesti       | [Mediterranean olive grove in Spain](https://www.pexels.com/photo/33892897/) |
| images/cottage.jpg | Demetra Ioannidou | [Stone facade and plants in Greece](https://www.pexels.com/photo/17882222/)  |

The `coast` demo photo key currently reuses village.jpg. Photos are not evidence of a listing's features, condition or location.

## Map outline

`map/region.geojson` is a regional subset of Natural Earth's 1:50m Admin 0 country polygons, downloaded from the [official Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson). Properties were reduced to country name and coordinate precision to four decimals. Natural Earth data is [public domain](https://www.naturalearthdata.com/about/terms-of-use/).

Street tiles, when available, use the [OpenFreeMap](https://openfreemap.org/) Positron vector style with visible OpenFreeMap, [OpenMapTiles](https://openmaptiles.org/) and [OpenStreetMap contributor attribution](https://www.openstreetmap.org/copyright). Map labels prefer English names, then Latin/source names. MapLibre's runtime worker is bundled locally; remote tiles and glyphs are not bundled or downloaded for offline use. The Natural Earth outline remains the local fallback.

## Live listing images and local place data

Original Plot.gr listing photographs load directly from observed public URLs on `static-cz.car.gr` and `static.plot.gr`. The app links each photograph to its source listing. These images are not demo assets, are not downloaded into the repository, and do not imply ownership or a licence to redistribute them.

Optional Greek settlement data comes from [GeoNames](https://www.geonames.org/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), downloaded by `npm run setup:local-data` into ignored `server/data/places/`. Map area markers represent named town/village centres and link to their GeoNames source; they do not identify the property's exact position.

The same setup installs the [Argos Greek-to-English translation package](https://github.com/argosopentech/argospm-index), used locally with CTranslate2 and SentencePiece. Model files and the Python environment remain in ignored `server/data/translation/`; no model binary is bundled with the frontend or committed to this repository.

## UI references

Mindtrip mobile [map and cards](https://mobbin.com/screens/4dcb8696-8b17-4d0f-b2b9-c5f90500633b) and [desktop explore](https://mobbin.com/screens/ec6b2fa2-d28e-4b58-b6ba-2528c2630b9f) via Mobbin informed layout and visual direction. No Mobbin screenshots or brand assets are embedded in this project.
