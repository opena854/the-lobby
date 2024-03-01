
/** 
 * @typedef ElevatorCore
 * @property {function(number, string): void} dispatch 
 * @property {number} elevatorCapacity
 * @property {Array<Object>} floors
 * @property {Array<Object>} units 
 */

import map, { ACTION } from "./map.js"
import { rndRange } from "./person.js"

const debug = {
	pendings: null
}

/**
* @param {number} id 
* @param {ElevatorCore} core
* @param {import("./game.js").GameSet} gameSet
*/
export const elevatorUnitFactory = (id, core, gameSet) => {
	core
	const size = 40
	const frameWidth = 5
	const x = gameSet.building.startX + gameSet.building.widthBase + id * 50
	const floorY = floor => core.floors[floor].y - size
	const yFloor = y => gameSet.floors - Math.floor( ( y - gameSet.building.startY ) / gameSet.floorHeight ) -1
	const position = map.coord(x, floorY(0))
	
	return {
		id,
		floor: yFloor(position.y),
		x: x,
		position: position,
		persons: Array(core.elevatorCapacity).fill(null),
		currentVelocity: map.vector(0, 0),
    addPerson(personId) {
      const idx = this.persons.indexOf(null)
      if (idx === -1) 
        return false; //sin espacio disponible
      else if (this.persons.includes(personId)) {  
        console.warn(`Persona ${personId} ya estaba en ascensor ${this.id}... [${this.persons.join(", ")}]`)
        //throw new Error();
      }
      this.persons[idx] = personId
			//console.log(`[${this.persons.map(personId => personId === null ? null : gameSet.persons[personId].emoji).join(", ")}]`)
      return true;
    },
		removePerson(personId) {
      const idx = this.persons.indexOf(personId)
      if (idx === -1) {
				console.log("about", personId)
        console.log(gameSet.persons)
        console.log([...this.persons])
        console.warn(`${gameSet.persons[personId].emoji} no estaba en ascensor ${this.id}... [${this.persons.map(personId => personId === null ? null : gameSet.persons[personId].emoji).join(", ")}]`)  
        //throw new Error();
        return
      }
      this.persons[idx] = null

      const ocupped = space => 'number' === typeof(space)
      
      //join
      this.persons.forEach( ( (person, idx) => {
        if (!ocupped(person) && ocupped(this.persons[idx + 2])) {
          this.persons[idx] = this.persons[idx+2]
          this.persons[idx+2] = null
        } 
      }))

      //balance
      let ocupacy = this.persons.map(ocupped)
      let left =  ocupacy.filter( (_, idx) => !(idx % 2))
      let right = ocupacy.filter( (_, idx) => (idx % 2))

			const sumOcupped = arr => arr.reduce( (sum, p) => sum += !!p ? 1 : 0, 0)

      while (Math.abs(sumOcupped(left) - sumOcupped(right)) >= 2) {
        
				if (left.lastIndexOf(true) > right.lastIndexOf(true)) {
        	this.persons[right.indexOf(false)*2+1] = this.persons[left.lastIndexOf(true)*2]
          this.persons[left.lastIndexOf(true)*2] = null
        } else {
          this.persons[left.indexOf(false)*2] = this.persons[right.lastIndexOf(true)*2+1]
          this.persons[right.lastIndexOf(true)*2+1] = null
        }
        
        ocupacy = this.persons.map(ocupped)
        left =  ocupacy.filter( (_, idx) => !(idx % 2))
        right = ocupacy.filter( (_, idx) => (idx % 2))
      }
    },
		velocity(t, d){
			
			const minVy = 5; //16px/seg
			const maxVy = 80; //16px/seg
			const aTime = 600
			const brakeDistance = maxVy * aTime / 1000
			
			const vyA = t > aTime ? maxVy : maxVy * (1 + Math.sin(Math.PI * t/aTime - Math.PI/2 )) / 2
			const vyB = d > brakeDistance ? maxVy : maxVy * (1 + Math.cos(Math.PI * (brakeDistance - d)/brakeDistance)) / 2
			const vy = Math.max(Math.min(vyA, vyB), Math.min(minVy, d * 2 ))

			return map.vector(0, vy)
		},
		direction: "up",
		updated: null,
		currentAction: 0,
		actions: [
			{ name: "wait", duration: rndRange(3, 10), reason: "init" }, //random initialization time
		],
		getCurrentAction() { 
			return this.actions[this.currentAction] 
			},
		setDestination(toFloor) {
      let pendingFloors = this.actions.slice(this.currentAction).filter( ({name}) => name == ACTION.MOVE ).map( ({toFloor}) => toFloor )
      
      if (pendingFloors.includes(toFloor)) return;

      pendingFloors.push(toFloor)
      let currentStopped = this.getCurrentAction().name
      currentStopped = [ACTION.IDLE, ACTION.WAIT].includes(currentStopped) && currentStopped
      
      this.actions = this.actions.slice(0, this.currentAction + (currentStopped ? 1 : 0))
      
      if (currentStopped === ACTION.IDLE) this.actions.push({ name: ACTION.WAIT, duration: 1.15 })
      
      for( var flo = this.floor, dir = this.direction; pendingFloors.length; flo += dir == "up" ? 1 : -1 ) {
        
        if (pendingFloors.includes(flo)) {
          this.actions.push(
            { name: ACTION.MOVE, toFloor: flo },
            { name: ACTION.WAIT, duration: 2.5 },
          )
          
          pendingFloors = pendingFloors.filter( floor => floor != flo )
        }

        if (flo === 0) dir = "up"
        if (flo === gameSet.floors -1) dir = "down"
      }
    },
    update(time){
			if (this.updated && this.updated > time) return;
			
			const timeDelta = (this.updated ? time - this.updated : time )
			
			const pendingActions = this.actions.slice(this.currentAction)
			
			for (const action of pendingActions) {
				let nextAction = this.currentAction;
				
				if (action.started === undefined) action.started = time - timeDelta;
				let elpased = time - action.started

				switch (action.name) {
					case "idle":
            this.direction = null;
						
            if (time - action.started + timeDelta > 500 && this.actions.length > this.currentAction +1) {
							nextAction++
							this.updated = time
						} else {
							this.updated = time + 500 - timeDelta

						}

						break;
					case ACTION.MOVE:
            
            if (action.toFloor === undefined) action.toFloor = yFloor(action.to.y)
            if (!action.to) {
              action.to = map.coord(this.x, floorY(action.toFloor))
              console.log(`elevator ${this.id} moving to toFloor ${action.toFloor}`)
            }
						
            const segment = map.segment(this.position, action.to)
						const { distance, direction } = segment.distance()
						const velocity = this.velocity(time, distance)
						this.currentVelocity = velocity;
						
						const newPos = map.coord(
							Math.round(velocity.x * direction.x * timeDelta/1000 + segment.coordA.x), 
							Math.round(velocity.y * direction.y * timeDelta/1000 + segment.coordA.y)
						)
						const newDistance = map.segment(newPos, action.to).distance()

						if (newDistance.direction.y != direction.y || newDistance.distance <= 1 ) {
              this.position = action.to
							nextAction++
							this.updated = time
						} else if (newPos.y != this.position.y) {
							this.position = newPos
							this.updated = time
						}
						
						this.direction = direction.y == -1 ? "up" : "down";
						const newFloor = yFloor(this.position.y)
						
						this.floor = newFloor

						break;
					case "wait":
						const nextMove = this.actions.slice(this.currentAction).find( a => a.name === ACTION.MOVE )
						if (nextMove && typeof(nextMove.toFloor) !== "number") console.error("next move doesn't have a toFloor", nextMove)
						const nextDirection = (nextMove) ? nextMove.toFloor - this.floor > 0 ? "up": "down" : null
						this.direction = action.reason || nextDirection || null
						
            if (!action.called) {
              if (this.direction != "down") core.silence(this.floor, "up")
              if (this.direction != "up") core.silence(this.floor, "down")
            }

						if ( time - action.started + timeDelta > action.duration * 1000) {
							nextAction++
							this.updated = time
						} else {
							this.updated = time + action.duration * 1000 - (time - action.started)
						}
						break;
				}
				
				if (nextAction != this.currentAction) {
					this.currentAction = nextAction;
				} else break;

				if (this.updated > time) break;
			}
			
			if (this.currentAction >= this.actions.length) {
				this.actions.push({ name: "idle" })
			}
		},
		
		draw(ctx, ms) {
			this.update(ms)
			
			ctx.font = "14px serif";
			ctx.fillStyle = "black";
      
      ctx.fillText(`[${this.persons.map( id => id === null ? null : gameSet.persons[id].emoji ).join(',')}] | ${this.actions.slice(this.currentAction).filter( a => a.name === ACTION.MOVE ).map( a => a.toFloor).join(" -> ")}`, 5, this.id * 30 + 30)
			
			ctx.font = "12px serif";
			ctx.fillStyle = "black";
			
			const statusOptions = {
				up: "🔼", 
				down: "🔽", 
				init: ["🟦","⏸","🟦","⏸"][Math.round((2*ms/1000)) % 4],
			}

			gameSet.elevatorCore.floors.forEach( floor => {
        ctx.font = "12px serif";
				ctx.fillText(`${this.floor +1} ${ statusOptions[this.direction] || '⏹' }`, this.position.x + 5, floorY(floor.floor) - 5)
        
        ctx.font = "14px serif";
        ctx.fillText(`${floor.attending.up === null ? "-" : floor.attending.up} | ${ floor.waiting.up ? _.round((performance.now() - floor.waiting.up)/1000 ): "-" }`, 1060, floorY(floor.floor) - 5, 20)
        ctx.fillText(`${floor.attending.down === null ? "-" : floor.attending.down} | ${ floor.waiting.down ? _.round((performance.now() - floor.waiting.down)/1000) : "-" }`, 1060, floorY(floor.floor) + 15, 20)
			})
      
      ctx.fillStyle = "darkblue";
			ctx.strokeRect(this.position.x + 2, gameSet.building.startY, size -4, gameSet.building.height)
			ctx.fillRect(this.position.x, this.position.y, size, size);
    	ctx.clearRect(this.position.x + frameWidth, this.position.y + frameWidth, size - frameWidth * 2, size - frameWidth * 2);
			ctx.fillRect(this.position.x + size/2 - 1, this.position.y, 3, size);

      ctx.fillStyle = "black";

      ctx.font = "10px serif";
			
      const yFullness = Math.max(
        this.persons.filter( (id, idx) => !(idx % 2) && id !== null ).length,
        this.persons.filter( (id, idx) => (idx % 2) && id !== null ).length,
      )

      const yGap = size / (2 * yFullness)

      this.persons.map( (personId, idx) => ({
        emoji: gameSet.persons[personId]?.emoji,
        x: this.position.x + (idx % 2 ? size/2 + 2: frameWidth),
        y: this.position.y + frameWidth + 10 + Math.floor(idx / 2) * (yGap) + 12 * Math.floor(idx / 2) /yGap,
      })).forEach( person => {
        if(person.emoji) ctx.fillText(person.emoji, person.x, person.y)
        //ctx.fillText(`(${person.x}, ${person.y}), ${person.log}`, person.x + 30, person.y)
        
      } )
		}
	}
}

/**
* @param {GameSet} gameSet 
*/
export const elevatorCoreFactory = (gameSet) => ({
	elevatorCapacity: gameSet.elevatorCapacity || 8,
	floors: Array(gameSet.floors).fill(null), 
	units: Array(gameSet.elevators).fill(null),
	
	checkCalls(){
		const pendings = this.floors.flatMap( (floor) => [
			{ direction: "up", pending: floor.attending.up === null && floor.waiting.up, floor: floor.floor }, 
			{ direction: "down", pending: floor.attending.down === null && floor.waiting.down, floor: floor.floor }
		]).filter( floor => floor.pending ).sort(({ pending: a}, { pending: b}) => a - b) 

    const assigns = []

		pendings.forEach( call => {
			const freeUnit = this.units
			.map( unit => ({ ...unit, action: unit.getCurrentAction() }))
			.filter( unit => 
				(
					unit.action.name === ACTION.IDLE && 
					!assigns.includes(unit.id)
				) ||
				(
					unit.action.name === ACTION.MOVE && 
					unit.floor === call.floor + (unit.direction === "up" ? -1 : 1) && 
					unit.direction === call.direction 
				)
			)
      .sort( ({floor: a}, {floor: b}) => Math.abs(a - call.floor) - Math.abs(b - call.floor) )[0]

      if (freeUnit) {
        
        this.units[freeUnit.id].setDestination(call.floor)
        assigns.push(freeUnit.id)
        this.attending(call.floor, call.direction, freeUnit.id)
      }
		})
    
    // if (debug.pendings != pendings.length ) {
    //   debug.pendings = pendings.length
    //   console.log("pendings", pendings, "assigns", assigns)
    // }
		
	},

	call(floor, direction){
		if ( this.floors[floor]?.waiting[direction] === null ) {
			this.floors[floor].waiting[direction] = performance.now();
			console.log(`elevator called from ${floor} to ${direction}`)
		}
	},
	attending(floor, direction, elevator){
		this.floors[floor].attending[direction] = elevator;
    let duration = _.round((performance.now() - this.floors[floor].waiting[direction])/1000, 3)
    console.log(`elevator ${elevator} assigned to floor ${floor} direction ${direction} after ${duration}s`)
	},
	silence(floor, direction){
    if (this.floors[floor].waiting[direction]) {
      let duration = _.round((performance.now() - this.floors[floor].waiting[direction])/1000, 3)
      this.floors[floor].waiting[direction] = null;
      this.floors[floor].attending[direction] = null;
      
      console.log(`elevator arrived to floor ${floor} direction ${direction} after ${duration}s`)
    }
	},
	init(){
		const core = this
		this.floors = this.floors.map((_, floor) => ({
			floor,
			y: gameSet.building.startY + (gameSet.floors - floor) * gameSet.floorHeight,
			waiting: { up: null, down: null },
			attending: { up: null, down: null }
		}), core )
		
		this.units = this.units.map((_, id) => elevatorUnitFactory(id, this, gameSet), core )
		
		return this
	}
}.init())

