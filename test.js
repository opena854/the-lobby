
import map from "./src/map"


let from = map.coord(646, 735)
let to = map.coord(520, 735)
let segment = map.segment(from, to)
let velocity = map.vector(10, 0)

console.log(
	from,
	to,
	map.walker(segment, velocity)
	
)


