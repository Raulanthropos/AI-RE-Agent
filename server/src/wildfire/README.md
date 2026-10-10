# Wildfire area context

This integration reads the European Commission Joint Research Centre / Copernicus EFFIS **Pan-European Wildfire Risk Assessment (2022 prototype)**. It provides comparative long-term area context in listing details. It is not a parcel survey, a prediction that a building will burn, a live incident feed or an emergency warning.

## Request and persistence

`GET /api/listings/:id/wildfire` resolves a listing through the server and queries three fixed, public WMS layers. The client supplies a listing ID, not a remote URL or arbitrary coordinates. The server uses source coordinates if present, otherwise the existing GeoNames settlement location. Missing or ambiguous locations remain unavailable. The endpoint observes the listing visibility rules, including explicitly reported land of at least 800 m².

The server makes bounded, validated requests and caches results in SQLite. Successful data is reused for 30 days. Unsuccessful attempts are cached for one hour to avoid repeatedly contacting an unavailable source. A refresh failure can retain the previous result with its original retrieval time and an explicit stale state; it must not silently mark it fresh. The model's publication year and the fetch timestamp are separate fields: refreshing the endpoint does not turn this into a 2026 assessment.

No API key, account, subscription or local GIS package is required. Automated tests use synthetic service responses. Real coordinates, downloaded datasets and research captures belong in ignored local data directories, not committed fixtures.

## Source protocol

Public WMS endpoint:

```text
https://maps.effis.emergency.copernicus.eu/effis
```

Use the published map configuration `/mnt/nfs/mapfiles/wfra.map`. Its [GetCapabilities document](https://maps.effis.emergency.copernicus.eu/effis?map=/mnt/nfs/mapfiles/wfra.map&service=wms&version=1.3.0&request=GetCapabilities) identifies these queryable layers:

| Layer | Meaning |
| --- | --- |
| `high-risk-aggr-wildfire-risk` | Prevalence of the higher-risk class in the reference cell |
| `intermediate-risk-aggr-wildfire-risk` | Prevalence of the intermediate-risk class in the reference cell |
| `low-risk-aggr-wildfire-risk` | Prevalence of the lower-risk class in the reference cell |

For each layer, use WMS `GetFeatureInfo`, `VERSION=1.1.1`, `SRS=EPSG:4326`, `INFO_FORMAT=text/html`, and the same fixed layer in `LAYERS` and `QUERY_LAYERS`. A small bounding box centred on the selected coordinates, 101 × 101 image dimensions and pixel `X=50`, `Y=50` select the centre. Longitude precedes latitude with this WMS version and CRS. The bounding box is a point-query mechanism; it does not increase the underlying model resolution or define a property boundary.

The response is simple text containing the layer label and a raw ratio between 0 and 1. The capabilities metadata specifies `wfra_layer_scaling_factor=100`, so the app converts this ratio to a percentage, as the official viewer does. The `text/plain` and GML formats were observed to omit the numeric values and are unsuitable here. Multiple requested layers can be concatenated without separators, so separate requests make strict parsing easier.

Missing coverage can return HTTP 200 with an **empty body**. Treat missing, malformed, nonfinite or out-of-range values as unavailable, never as zero risk. Validate all three classes and their combined total before showing a distribution. A dominant-class summary is derived by the app; the underlying three percentages remain available to explain it.

## Interpretation and precision

The [official user guide](https://data.effis.emergency.copernicus.eu/apps/fire.risk.viewer/effis.fire.risk.viewer.user.guide.pdf) and dataset README define approximately 0.11-degree / **12.5 km EURO-CORDEX reference cells**. Downloadable GeoTIFF files use smaller reprojected pixels, but those pixels do not improve the reference information's resolution. The guide describes the values as prevalence in the cell area, and the [methodology](https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/wildfire-risk-assessment) explains the aggregation of danger, exposure, vulnerability and model uncertainty.

The three percentages represent low, intermediate and high **model risk classes**. A value of 100% for the higher-risk class means that the selected model cell has that class throughout its reported distribution. It does **not** mean a 100% chance of a fire, annual loss probability or certainty of damage. Conversely, a low-class result cannot establish that a parcel is safe.

Display the assessment year, source, approximate resolution, whether the lookup used source or settlement coordinates, and the data retrieval/stale state. A settlement lookup describes its broad surrounding area; even source coordinates do not supply a surveyed parcel boundary. Keep this information separate from listing assertions and from the fixed fit score. Do not automatically award or subtract wildfire points, or rewrite the listing's own `wildfireRisk` field from this coarse assessment.

The [Greek Civil Protection daily map archive](https://civilprotection.gov.gr/arxeio-imerision-xartwn) is a separate external reference for regional short-term forecasts. The [ministry's explanation](https://civilprotection.gov.gr/odigies-prostasias/dasikes-pyrkagies) describes next-day danger categories over forest-service administrative areas. The app does not infer a daily classification from the long-term EFFIS model or from a settlement name.

## Attribution and freshness

Data is available under the [EFFIS CC BY 4.0 reuse policy](https://forest-fire.emergency.copernicus.eu/about-effis/data-license). Credit the European Commission Joint Research Centre / Copernicus EFFIS, identify the Pan-European Wildfire Risk Assessment (2022), link its methodology and licence, and identify the point lookup, percentage conversion and dominant-class summary as app processing.

The official [higher-risk class download](https://gwis-reports.s3-eu-west-1.amazonaws.com/WFRA/var-risk-aggr-l3p122_unit-dimensionless_stat-rank_class3-3.zip) contains CSV, GeoTIFF and README data. Its HTTP last-modified date was 3 October 2022 when verified. The prototype has no update cadence promised by this integration. Keep the 2022 label until a separately researched source revision is adopted.
