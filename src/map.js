
const ACTION = {
	WALK: "walk",
	MOVE: "move",
	WAIT: "wait",
	IDLE: "idle",
	BORED: "bored",
	SET: "set",
	ELEVATOR: "elevator",
	JUMP: "jump",
	GOTO: "goto",
  REMOVE: "remove"
}

/**
 * @typedef Action
 * @property {string} name - Any of ACTION object.
 * @property {map.Coord} to - Destination [move, walk, jump]
 * @property {}
 */


const map = {
	safeDistance: 20,
	coord (x, y){
		if (x instanceof Array && y === undefined) {
			y = x[1]
			x = x[0]
		}
		if (typeof(x) != "number" || typeof(y) != "number") 
			throw new Error("Invalid coords")

		/** @property Coord */
		const retval = {
			x, 
			y,
			toArray() { return [this.x, this.y]},
			moveBy(deltaX, deltaY) { return map.coord(this.x + deltaX, this.y + deltaY) },
			toString() { `(${this.x}, ${this.y})` }
		}
		
		return retval
	},
	vector(x,y) {
		return {
			...map.coord(x,y),
			velocity () {
				return Math.hypot(this.x, this.y)
			},
			angle(){
				return Math.atan(this.x / this.y) * (180 / Math.PI)
			},
			unitVector() {
				const mv = 1/this.velocity();
				return map.vector(this.x * mv, this.y * mv)
			},
			scale(v){
				return map.vector(this.x * v, this.y * v)
			},
			addCoord(coord){
				return map.vector(this.x + coord.x, this.y + coord.y)
			},
			toCoord(round = true) {
				return round ? map.coord(Math.round(this.x), Math.round(this.y)) : map.coord(this.x, this.y)
			}
		}
	},
	segment(coordA, coordB){
		return {
			coordA, 
			coordB,
			vectorize() {
				const x = coordB.x - coordA.x
				const y = coordB.y - coordA.y
				return map.vector(x, y)
			},
			distance(){
				const x = coordB.x - coordA.x
				const y = coordB.y - coordA.y
				return {
					...map.coord(x, y),
					direction: map.coord( Math.round(x ? x / Math.abs(x) : 1), Math.round(y ? y / Math.abs(y) : 1)),
					distance: Math.hypot(x, y)
				}
			},
			at(d = undefined, safeDistance = undefined) {
				if (d === undefined) d = Math.random()
				if (safeDistance === undefined) safeDistance = map.safeDistance

				const segmentParts = this.distance()
				
				let distance = (d > 1) 
					? d 
					: (d >= 0)
					? d * segmentParts.distance
					: segmentParts.distance - d

        if (safeDistance) {
          if (segmentParts.distance > safeDistance * 2.5 ) {
            const start = safeDistance / 2, end = safeDistance * 3/2
  
            if (distance < start) distance = start
            else if (distance + end > segmentParts.distance ) distance = segmentParts.distance - end
          } else 
            distance = Math.max(segmentParts.distance / 2 - 10, 10)
        
        }
				
				const coordDif = map.vector(segmentParts.toArray()).unitVector().scale(distance).toCoord()
				return map.vector(this.coordA.toArray()).addCoord(coordDif).toCoord() 
			},
			subsegment(from, to){
				return map.segment(this.at(from, 0), this.at(to, 0))
			}
		}
	},
	nearestPosition(segment, vector){
		const iVector = segment.vectorize()
		const theta = iVector.angle() - vector.angle()
		const distance = Math.cos(theta) * iVector.velocity()
		return vector.unitVector().scale(distance).addCoord(segment.coordA).toCoord()
	},
	walker(segment, velocity){
		const realSegment = segment //map.segment(segment.coordA, map.nearestPosition(segment, velocity))
		const { distance, direction } = realSegment.distance()
		
		return {
			...realSegment,
			velocity,
			direction,
			positionAt(t){
				return map.coord(
					Math.round(this.velocity.x * this.direction.x * t/1000 + this.coordA.x), 
					Math.round(this.velocity.y * this.direction.y * t/1000 + this.coordA.y)
				)
			},
			duration: (distance / velocity.velocity()) * 1000
		}
	},
	destinations: {},
	
	/**
	 * Returns a new destination based on deserability
	 * @param {number} rnd - random probability
	 * @returns {string} - destination
	 */
	getNewDestination: rnd => "street",

	/**
	 * Returns an array of task for a person to get to a destination
	 * @param {string} location 
	 * @param {Coord} position 
	 * @param {string} destination 
	 * @returns Algo
	 */
	pather(location, position, destination){ return [] },
	
	/**
	 * Gets the position in y axis of a floor.
	 * @param {number} floor floor index to determine position in y axis
	 * @returns {number}
	 */
	floorY(floor) { return null },
	
	/**
	 * Gets floor corresponding to the {y} position in y axis.
	 * @param {number} y floor index to determine position in y axis
	 * @returns {number} floor
	 */
	yFloor(y) { return null },

	/** Prepares a pather function and destinations 
	 * @param {GameSet} gameSet
	*/
	patherInit(gameSet) {
		this.humanDrawHeight = gameSet.humanDrawHeight || -5		
		this.safeDistance = gameSet.safeDistance || this.safeDistance

		const { building } = gameSet
		const street = this.segment(
			gameSet.street.coordA.moveBy(0, this.humanDrawHeight),
			gameSet.street.coordB.moveBy(0, this.humanDrawHeight)
		)
		
		const buildingFloors = Array(gameSet.floors).fill({}).map ((_, floor) => {
			const baseCoord = map.coord(building.startX, street.coordA.y - floor * gameSet.floorHeight)

			const floorSegment = map.segment(baseCoord, baseCoord.moveBy(building.width, 0))

			return {
				floor,
				segment: floorSegment,
				destinations: Object.entries({
					"exit": floor === 0 ? floorSegment.subsegment(0, 30 + map.safeDistance) :  "floor 0 exit",
					"elevators": floorSegment.subsegment(building.widthBase + map.safeDistance - building.elevatorWidth, 1),
					"common area": floorSegment.subsegment(0, building.widthBase),
					"": floorSegment,
				}).reduce( (obj, [name, segment]) => Object.assign(obj, { [`floor ${floor} ${name}`.trim()]: segment }), {}),
			}

		})

		this.destinations = {
			"street": street,
			"outermost": street.subsegment(0, 1/3),
			"front yard": street.subsegment(1/3, building.startX + building.width / 2 - street.coordA.x),
			"backyard": street.subsegment(building.startX + building.width / 2 - street.coordA.x, .97),
			"entrance": street.subsegment(building.startX - this.safeDistance - 30, building.startX - this.safeDistance),
			"die": street.subsegment(.97, 1),
			"exit": street.subsegment(.97, 1),
			...Object.assign({}, ...buildingFloors.map( floor => floor.destinations )),
		}

		console.log("destinations loaded:", this.destinations)

		let totalQuota = 0
		let asignedProbability = 0
		this.destinationsChances = Object.entries(gameSet.desirability).flatMap( ([regexStr, quota]) => {
			const regex = new RegExp(regexStr)
			
			return Object.keys(this.destinations).filter( key => regex.test(key) ).map( destination => {
				totalQuota += quota
				return { destination, quota }
			} )
		}).map( obj => {
			const from = asignedProbability
			const chances = (obj.quota / totalQuota, 4)
			asignedProbability = (asignedProbability + chances, 4)
			return {
				...obj,
				chances: chances,
				from,
				to: asignedProbability
			}
		})

		console.log("destinations chances loaded:", this.destinationsChances)

		this.getNewDestination = (rnd) => map.destinationsChances.find( dst => rnd >= dst.from && rnd < dst.to ).destination

		this.floorY = floor => street.y - floor * gameSet.floorHeight
		this.yFloor = y => gameSet.floors - Math.floor( ( y - building.startY ) / gameSet.floorHeight ) -1
	
		this.pather = (location, position, destination, precise = undefined) => {
			
			if (typeof(map.destinations[destination]) == "string") 
				return map.pather(location, position, map.destinations[destination]) //alias
			
			const result = []
			
			const destinationFloor = Number((/^floor (?<floor>[0-9])[\S\s]*/.exec(destination)?.groups || {})["floor"]).valueOf()
			const destinationCoord = map.destinations[destination].at(precise)

			//should go inside?
			if (location === "outside" && !isNaN(destinationFloor)) {
				result.push(
					{ name: ACTION.WALK, to: map.destinations['entrance'].at() },
					{ name: ACTION.WAIT, duration: 0.25 },
					{ name: ACTION.JUMP, to: map.destinations['floor 0 exit'].at(), location: "building" },
					{ name: ACTION.WAIT, duration: 0.25 },
				)
			}

			let currentFloor = map.yFloor(position.y)

			//should take elevator?
			if ( (destinationFloor || 0) !== currentFloor ){
				const direction = (destinationFloor || 0) > currentFloor ? "up" : "down";
				
				result.push(
					{ name: ACTION.WALK, to: map.destinations[`floor ${currentFloor} elevators`].at() },
					{ name: ACTION.WAIT, duration: 0.25 },
					{ name: ACTION.WAIT, direction, elevators: gameSet.elevatorCore.units, toFloor: (destinationFloor || 0) }, //wait-for-elevator action pushes elevator-in&out actions
				)

				currentFloor = (destinationFloor || 0) //destinationFloor is now currentFloor
			}

			//should go outside?
			if (location !== "outside" && isNaN(destinationFloor)) {
				result.push(
					{ name: ACTION.WALK, to: map.destinations['floor 0 exit'].at() },
					{ name: ACTION.WAIT, duration: 0.25 },
					{ name: ACTION.JUMP, to: map.destinations['entrance'].at(), location: "outside" },
					{ name: ACTION.WAIT, duration: 0.25 },
				)
			}

			// just walk to destination
			result.push(
				{ name: ACTION.WALK, to: destinationCoord },
				{ name: ACTION.WAIT, duration: 0.25 },
			)
			
			//will I die?
			if (destination === "die") {
				result.push(
					{ name: ACTION.WAIT, duration: 1.5, reason: "dying" },
					{ name: ACTION.WAIT, duration: 4.0, reason: "die" },
					{ name: ACTION.REMOVE },
				)
			}
      if (destination === "exit") {
				result.push(
					{ name: ACTION.REMOVE },
				)
			}


			//console.log("path:", result)

			return result;
		}
	}
}

// try {
// 	module.exports = { map, ACTION }
// } catch {}

export { map, ACTION }
export default map
