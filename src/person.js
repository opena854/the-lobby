import map, { ACTION } from "./map.js"

const debug = {
	action: null
}
const emojis = ["😀","😁","😂","😄","😅","😎","😊","😋","🥰","🤩","😫","😥","😰","😬","🥶","😛","😍","🤑","🤪","🤡","🤠","🥳","🧐","🤓","👽","👻","😶","🤒","🤕","🐴"]

export function rndRange (from, to) {
	return Math.floor(from + Math.random() * (to-from))
}

/** 
 * @param {GameSet} gameSet 
 * @returns Person
*/
export const personFactory = (gameSet) => {
	//const floorY = floor => core.floors[floor].y - size
	const floorY = floor => gameSet.street.coordA.y - gameSet.floorHeight * floor - 5
	const id = gameSet.persons.length

	return {
		id,
		created: performance.now(),
		location: "outside",
		position: map.coord(10, floorY(0)),
		velocity: map.vector(gameSet.personSpeed || 100, 0),
		direction: map.vector(1,0), //left to right
    emoji: emojis[id % emojis.length],
    baseCreativity: rndRange( 10, 50 ),
		currentAction: 0,
		timeElpased: 0,
		actions: [
			{name: ACTION.GOTO, destination: "street" },
		],
		injectActions(...newActions) {
			this.actions = [
				...this.actions.slice(0, this.currentAction+1),
				...newActions,
				...this.actions.slice(this.currentAction+1)
			]
		},
		update(time){
			if (this.updated && this.updated > time) return;
			
			this.updated = time;
			
			time -= this.timeElpased;
      
			while (this.actions.length > this.currentAction){
			//for (const action of pendingActions) {
				let duration = 0;
				let action = this.actions[this.currentAction]

				switch (action.name) {
          case ACTION.REMOVE: 
            this.location = "none"
            gameSet.removePerson(this.id)
            break;
					case ACTION.GOTO:
						duration = time - 1
						this.injectActions(...map.pather(this.location, this.position, action.destination))
						break;
					case ACTION.BORED:
						duration = action.duration * 1000
	
						if (time > duration && action.creativity / 100 > Math.random()) {
							const newDestination = map.getNewDestination(Math.random())
							//console.log(`${this.emoji} got an idea: ${newDestination}`);
              gameSet.log.push(`${this.emoji} -> ${newDestination}`)
							this.injectActions(...map.pather(this.location, this.position, newDestination))
						}
						
						break;
					case ACTION.WAIT: //waits until duration or elevator available.
						duration = action.duration * 1000 
						
            if (action.elevators) {
              const elevator = action.elevators?.find( e => //searchs for the first elevator that...
                e.floor === map.yFloor(this.position.y) && //is in my floor
                (e.direction === null || e.direction === action.direction) && //is going on my direction
                [ACTION.IDLE, ACTION.WAIT].includes(e.getCurrentAction().name) //elevator is waiting
                //should check the queue for elevator fullness isues.
              )

              if (elevator) {
                this.injectActions(
                  {
                    name: ACTION.WAIT,
                    duration: rndRange(250, 950)/1000,
                  }, { 
                    name: ACTION.ELEVATOR, 
                    elevator,
                    toFloor: action.toFloor,
                    direction: action.direction,
                  },
                )
                duration = time - 1//task finished
              } else if (!action.called) {
                gameSet.elevatorCore.call( map.yFloor(this.position.y), action.direction)
                action.called = true
              }
            }
						break;
					case ACTION.JUMP:
						duration = 0
						this.position = action.to
						
						if (action.location) this.location = action.location
            if (action.elevator) action.elevator.removePerson(this.id)
						if (action.elevator) 
							console.log(
								this.emoji, 
								'got out', 
								action.elevator.id,
								`[${action.elevator.persons.map(personId => personId === null ? null : gameSet.persons[personId].emoji).join(", ")}]`
							)

						//console.log('jump to', action.to)
						break;
					case ACTION.WALK:
						action.to.y = this.position.y //person can't walk in y-axis

						if (!action.walker) {
              action.walker = map.walker(map.segment(this.position, action.to), this.velocity)
              this.direction = action.walker.direction
            }
						
						duration = action.walker.duration
	
						this.position = time > duration ? action.walker.coordB : action.walker.positionAt(time)
	
						break;
					case ACTION.ELEVATOR: 
            const elevatorStopped = [ACTION.IDLE, ACTION.WAIT].includes(action.elevator.getCurrentAction().name)
            duration = undefined

						if (this.location !== "elevator" && elevatorStopped) {
							if(action.elevator.addPerson(this.id)){
								//got in              
								this.location = "elevator"
								action.elevator.setDestination(action.toFloor)
								console.log(
									this.emoji, 'got in', 
									action.elevator.id,
									`[${action.elevator.persons.map(personId => personId === null ? null : gameSet.persons[personId].emoji).join(", ")}]`
								)
								
								break;
							}
						} else if (this.location === "elevator") {
							this.position = map.coord(action.elevator.position.toArray()) 

							if (elevatorStopped && action.elevator.floor == action.toFloor) {
								//have to get out
								this.injectActions(
									{
										name: ACTION.WAIT,
										duration: rndRange(400, 1200)/1000,
										reason: "elevator", //this person is triying to get out of elevator.
									}, { 
										name: ACTION.JUMP, 
										to: map.coord(this.position.x - 20, floorY(action.toFloor)),
										elevator: action.elevator,
										location: "building",
									},{
										name: ACTION.WAIT,
										duration: rndRange(400, 1200)/1000,
									},
								)
								
								duration = time - 1 //time consumed
							}

							break;
						}
						
						//lost this one
						console.log(this.emoji, 'lost this one', elevatorStopped, this.location)
						
						duration = time -1 //end current action
						
						this.injectActions({ //add a wait-for-elevator action.
							name: ACTION.WAIT,
							elevators: gameSet.elevatorCore.units,
							toFloor: action.toFloor,
							direction: action.direction
						})
						break;
				}
				
				if(this.currentAction != debug[this.emoji]?.action) {
					debug[this.emoji] = { action: this.currentAction }
					const action = this.actions[this.currentAction]
					
					const actionDetails = {
						[ACTION.BORED]: ["creativity"],
            [ACTION.WALK]: ["to"]
					}[action.name]?.map( key => `${key}: ${ action[key] }` ).join(', ')

					//console.log(this.emoji, `action ${this.currentAction}/${this.actions.length}: `, action.name, actionDetails, action)
				}

				if (time > duration) {
					this.currentAction++;
					this.timeElpased += duration;
					time -= duration;
				} else break;
			}
			
			if (this.currentAction >= this.actions.length) {
				const lastAction = this.actions.map( a => a.name === ACTION.BORED ).lastIndexOf(false)
				const timeBored = lastAction === -1 ? 0 : this.actions.slice(lastAction +1 ).map( a=> a.duration).reduce( (a,b) => a+b, 0 );
	
				//console.log(`${this.emoji} has been bored for ${timeBored} secs (la: ${lastAction})`);
        
        //maybe im too old for this
        if (this.currentAction > rndRange(100, 250))
        {
          this.actions.push({
            name: ACTION.GOTO,
            destination: "die"
          })
  
        }
        else {
          this.actions.push({
            name: ACTION.BORED,
            duration: Math.floor(time/1000 + rndRange(1, 3)),
            creativity: timeBored * 5 + this.baseCreativity
          })
  
        }
			}
	
		},
	
		draw(ctx, ms) {
			this.update(ms - this.created)
			const currentAction = this.actions.at(this.currentAction)
			const currentActionName = currentAction?.reason || currentAction?.name || "nothing";
	
			const mindEmojis = {
				//bored: "🥱",
				die: "💀",
				dying: "😭"
			}
	
			const actionEmoji = currentActionName === "walk" ? "🚶‍♂️" : currentActionName === "die" ? "⚰" : "🧍‍♂️";
			const mindEmoji = mindEmojis[currentActionName] || this.emoji;
	
			// ctx.font = "14px serif";
			// const logActions = this.actions.map( (a, i) => this.currentAction === i ? `[${a.name}]` : a.name )
			// ctx.fillText(`${this.emoji} ${logActions.length} | ${logActions.slice(this.currentAction > 3 ? this.currentAction -3 : 0, this.currentAction + 10 ).join(", ")}` , 5, 20+ this.id * 16)
			
			switch (currentActionName) {
				case "elevator":
        case "remove":
            // ctx.font = "10px serif";
					// ctx.fillText(mindEmoji, this.position.x + 5, this.position.y + 16)
					break;
				default:
          if (this.location === "none") break

					ctx.font = "24px serif";
					if (currentActionName === "walk" && this.direction.x === 1){
            ctx.save()
            ctx.scale(-1,1)
            ctx.fillText(actionEmoji, -18 -1 * this.position.x, this.position.y)
            ctx.restore()  
          } else {
            ctx.fillText(actionEmoji, this.position.x, this.position.y)
          }
					
					ctx.font = "12px serif";
					ctx.fillText(mindEmoji, this.position.x + 1, this.position.y - 30)
					//ctx.fillText(_.round(this.timeElpased / 1000), this.position.x + 1, this.position.y - 45)
					break
			}
			
		}
	}
}

