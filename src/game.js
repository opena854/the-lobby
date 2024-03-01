import { elevatorCoreFactory } from "./elevator.js";
import map from "./map.js";
import { personFactory } from "./person.js";


/**
 * @typedef {Object} Building
 * @property {number} startX
 * @property {number} startY
 * @property {number} width
 * @property {number} height
 * @property {number} widthBase
 * @property {number} elevatorWidth
 * Also useful to show different icons.
 */


/**
 * @typedef {Object} GameSet
 * @property {boolean} ok
 * @property {number} floorHeight
 * @property {[Segment]} floorSegments
 * @property {Building} building
 * @property {Segment} street
 * @property {Object} elevatorCore
 * @property {number} floors
 * @property {number} elevators
 * @property {Object<string, number>} desirability
 * Also useful to show different icons.
 */


const parameters = {
	ok: true,
	floorHeight: 80,
	street: map.segment(map.coord(0, 740), map.coord(1080, 740)),
	building: {
		startX: 500,
		widthBase: 250
	},
	log: ["game started"],
	desirability: {
		"^exit": 5,
		"front yard": 20,
		"outermost": 20,
		"backyard": 20,
		"[\\s\\S]* common area": 20,
	},
	elevatorCapacity: 4,
	timeSpeed: 3
}

/**
 * 
 * @param {GameSet} gameSet 
 */
function drawer(gameSet) {
	console.log('starting', gameSet)
	const draw = (time) => {
		
		/** @type CanvasRenderingContext2D  */
		const ctx = document.getElementById("canvas").getContext('2d');

		const secs = Math.floor((time - gameSet.startTime) * gameSet.timeSpeed / 1000)
		const secDiff = secs - gameSet.secs
		gameSet.tics++;
		gameSet.secs = secs

		if(gameSet.personRate * secDiff / 60 > Math.random()) {
			gameSet.addPerson(personFactory(gameSet))
		}

		const building = gameSet.building

		ctx.clearRect(0, 0, 1080, 768);
		ctx.font = "12px serif";
		ctx.fillStyle = "black";

		// timer
		ctx.fillText(`time: ${gameSet.secs.toString()} s`, 980, 20);
		ctx.fillText(`persons: ${gameSet.persons?.filter( p => !!p ).length}/${gameSet.persons.length}`, 980, 36);
		
		ctx.fillText(gameSet.log.slice(-10).reverse().join(', '), 5, 760);
		

		const segments = [
			gameSet.street,
			...gameSet.floorSegments
		]

		//segments (where people would walk)
		ctx.fillStyle = "gray";
		ctx.beginPath()
		segments?.forEach( segment => {
			ctx.moveTo(...segment.coordA.toArray())
			ctx.lineTo(...segment.coordB.toArray())
		})
		ctx.stroke()

		//building walls
		ctx.fillStyle = "black";
		ctx.strokeRect(building.startX, building.startY, building.width, building.height )

		//building roof
		ctx.beginPath();
		ctx.moveTo(building.startX - 20, building.startY);
		ctx.lineTo(building.startX + building.width / 2, building.startY - gameSet.floorHeight);
		ctx.lineTo(building.startX + building.width + 20, building.startY);
		ctx.closePath();
		ctx.stroke();

		
		
		//segments
		Object.entries(map.destinations).forEach(([name, segment]) => {
			if (typeof(segment) == "string") return;
			
			ctx.fillStyle = 
				/exit/.test(name) 
				? "rgba(200,50,50, 0.8)"
				: /entrance/.test(name) 
				? "rgba(200,50,50, 0.8)"
				: /elevator/.test(name) 
				? "rgba(200,50,50, 0.8)" 
				: /elevator/.test(name) 
				? "rgba(0,0,200, 0.5)" 
				: /backyard/.test(name) 
				? "rgba(75,175,0, 0.5)" 
				: /outermost/.test(name) 
				? "rgba(75,175,0, 0.5)" 
				: /front/.test(name) 
				? "rgba(100,200, 0, 0.5)" 
				: /street/.test(name) 
				? "rgba(255,0, 255, 0.0)" 
				: "rgba(100,100,100, 0.3)" 

			ctx.fillRect(segment.coordA.x, segment.coordA.y - 5, segment.distance().distance, 10)

			// ctx.save()
			// ctx.font = "18px serif";
			// ctx.translate(segment.coordA.x + 10, segment.coordA.y - 7)
			// ctx.globalAlpha = 1
			// ctx.rotate(-45)
			// ctx.fillText(name, 0, 0)
			// ctx.restore()
		})

		gameSet.elevatorCore.checkCalls()
		//elevators
		gameSet.elevatorCore?.units?.forEach( elevator => {
			elevator.draw(ctx, (time - gameSet.startTime) * gameSet.timeSpeed)
		})

		//persons (prioriza las personas que tienen mas tiempo esperando)
		gameSet.persons?.filter( p => !!p ).sort(({ timeElpased : a }, { timeElpased : b }) => b-a).forEach(person => {
			person.draw(ctx, time * gameSet.timeSpeed);
		})

		if (!gameSet.stop) window.requestAnimationFrame(draw)
	}

	return draw
}

window.drawer = drawer
window.parameters = parameters

document.addEventListener('alpine:init', () => {
	Alpine.data('numberInputFactory', (label, init, min, max) => ({
		label: label,
		qty: init,
		add() { this.qty++ },
		sub() { this.qty-- },
		get isMin() { return this.qty <= min },
		get isMax() { return this.qty >= max },
		reset() { this.qty = init },
	}));

	Alpine.data('personFactory', personFactory)
	
	Alpine.data('elevatorCoreFactory', elevatorCoreFactory)

	Alpine.data('gameSet', (settings) => ({
		...settings,
		startTime: performance.now(),
		secs: 0,
		tics: 0,
		persons: [],
		elevatorCore: null,
		addPerson(person) {
			this.persons.push(person);
			this.log.push(`${person.emoji} added`);
		},
		removePerson(personId){
			this.log.push(`${this.persons[personId].emoji} quit`)
			this.persons[personId] = undefined
		},
		setup() {
			console.log(settings)
			const { widthBase = 350, elevatorWidth = 50 } = this.building
			const streetLevel = this.street.coordA.y

			this.building = {
				...this.building,
				widthBase,
				elevatorWidth,
				startY: streetLevel - this.floors * this.floorHeight,
				width: widthBase + elevatorWidth * this.elevators,
				height: this.floors * this.floorHeight
			}

			this.floorSegments = Array(this.floors -1).fill(0).map( (_, floor) => {
				const x0 = this.building.startX
				const x1 = this.building.startX + this.building.width
				const y = streetLevel - (floor +1) * this.floorHeight
				return map.segment(map.coord(x0, y ), map.coord(x1, y ))
			} )
			
			this.elevatorCore = elevatorCoreFactory(this) 

			map.patherInit(this)
			return this;
		}
	}))
})