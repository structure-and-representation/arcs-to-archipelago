// 平面座標の定義(build_geo.mjs と verify_geo.mjs で共有する)。
// Lambert Conformal Conic。単位は km、原点は東経138度・北緯36度、x は東が正、y は北が正。
export const PROJ = '+proj=lcc +lat_1=30 +lat_2=40 +lat_0=36 +lon_0=138 +ellps=GRS80 +units=km'
