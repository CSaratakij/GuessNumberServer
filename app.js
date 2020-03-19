const MAX_SCORE = 1000

var express = require('express')
var http = require('http')
var socketIO = require('socket.io')

var app = express()
var server = http.Server(app)
var io = socketIO(server, {
    cookie: false
})

var mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
mongoose.set('debug', true);

var gameInfo = {
    isStart : 0,
    hasWinner : 0,
    winner : ""
}

var joinedPlayers = {}
var number = getRandomInt(101);
var scoreSchema;
var Score;

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}

function respondNormalInfo(socket, io, playerName) {
    //add player
    joinedPlayers[socket.id] = playerName

    io.emit('message.send', { message: "[server]: " + playerName + " has connected..."});
    io.emit("game.respondJoinedPlayers", joinedPlayers);

    //send current score
    Score
        .findOne({name: playerName}, 'tryCount', (err, score) => {
            if (err) {
                return console.error(err);
            }

            socket.emit('game.respondScore', score);
        });
}

server.listen(5000)

mongoose.connect('mongodb://localhost/guessnumber', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    keepAlive: true
});

var db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
    console.log("Connect to db successfull...")

    scoreSchema = new mongoose.Schema({
        // "_id": false,
        name: String,
        tryCount: Number
    });

    Score = mongoose.model('scores', scoreSchema);
});

io.on('connection', (socket) => {
    console.log('client connected')
    socket.emit('game.changePlayState', gameInfo);

    // io.of('/').clients((error, clients) => {
    //     if (error) throw error;
    //     console.log(clients);
    //     io.emit('game.respondJoinedPlayers', { players: clients});
    // });

    socket.on('add.player', (data) => {
        let playerName = data["name"]
        joinedPlayers[socket.id] = playerName

        console.log(joinedPlayers);

        io.emit('message.send', { message: "[server]: " + playerName + " has connected..."});
        io.emit("game.respondJoinedPlayers", joinedPlayers);
    });

    socket.on('message.sent', (data) => {
        console.log(data)
        io.emit('message.send', data)
    });

    socket.on('game.requestJoinedPlayers', () => {
        socket.emit("game.respondJoinedPlayers", joinedPlayers);
    });
    
    socket.on('game.requestCreatePlayer', (data) => {
        let owner = data["requestOwner"];
        Score
            .findOne({name: owner}, 'name tryCount', (err, score) => {
                if (score == null) {
                    console.log("No one use..")

                    let newScore = new Score({
                        name: owner,
                        tryCount: 1000
                    })

                    newScore.save();
                    respondNormalInfo(socket, io, owner)
                }
                else
                {
                    respondNormalInfo(socket, io, owner)
                }
            });
    });

    socket.on('disconnect', (reason) => {
        console.log("disconnect reason : " + reason);

        io.of('/').clients((error, clients) => {
            if (error) throw error;

            key = socket.id;
            disconectPlayer = joinedPlayers[key]

            delete joinedPlayers[key];

            io.emit('game.respondJoinedPlayers', joinedPlayers);
            console.log(joinedPlayers);

            io.emit('message.send', { message: "[server]: " + disconectPlayer + " has disconnected..."});
        });
    });

    socket.on('game.requestToStart', (data) => {
        let ownerName = data["requestOwner"];
        let randNumber = getRandomInt(101);

        socket.emit("game.respondToStart", { 
            owner: ownerName,
            chooseNumber: randNumber
        });

        socket.broadcast.emit('message.send', {
            message: ("[server]: " + ownerName + " has started their game...")
        });

        console.log("request start : " + ownerName);
        console.log(ownerName + " has started their game..");
        console.log(ownerName + " has number : " + randNumber);
    });

    socket.on('game.scoreSubmit', (data) => {
        let ownerName = data["requestOwner"];
        let tryCountStr = data["tryCount"];

        let tryCountNumber = Number(tryCountStr);
        let newScore = tryCountNumber;

        let prefix = (tryCountNumber > 0) ? "tries" : "try";
        let logMessage = "[server]: " + ownerName + " has finished their game with " + newScore + " " + prefix;

        io.emit('message.send', {
            message: logMessage
        });

        var oldScore = MAX_SCORE

        Score
            .findOne({name: ownerName}, 'tryCount', (err, score) => {
                if (err)return console.log(error)

                if (score == null) {
                    var tempScore = new Score({
                        name: ownerName,
                        tryCount: MAX_SCORE
                    })

                    score = tempScore;
                }

                oldScore = Number(score["tryCount"]);
                console.log("Old score : " + oldScore);

                if (oldScore <= newScore)
                {
                    return;
                }

                Score
                    .findOneAndUpdate({name: ownerName}, { 'tryCount': tryCountNumber }, { new: false, upsert: true }, (err, doc) => {
                        if (err) return console.error(err)
                            console.log("update to db successfull");
                    }); 
                });
    });

    socket.on('game.requestScore', (data) => {
        let owner = data["requestOwner"]
        Score
            .findOne({name: owner}, 'tryCount', (err, score) => {
                if (err) {
                    return handle.error(err);
                }

                socket.emit('game.respondScore', score);
            });
    });

    socket.on('game.requestLeaderBoard', () => {
        Score
            .find({})
            .sort({'tryCount': 1})
            .limit(50)
            .exec((err, scores) => {
                if (err) return handleError(err);
                socket.emit('game.respondLeaderBoard', { info: scores });
                console.log("sent leaderboard up to : " + 50)
                console.log(scores)
            });
    });

    // socket.on('game.requestToStart', (data => {
    //     console.log("request start : " + data["requestOwner"]);

    //     if (gameInfo.isStart <= 0)
    //     {
    //         gameInfo.isStart = 1;
    //         number = getRandomInt(101);

    //         console.log("Game start by: " + data["requestOwner"] + " Success..");
    //         console.log("current number : " + number);

    //         let info = {
    //             message: "Game start by: " + data["requestOwner"] + " Success.."
    //         }

    //         io.emit('message.send', info);
    //         io.emit('game.changePlayState', gameInfo);
    //     }
    //     else
    //     {
    //         let info = {
    //             message: "Game already stop.."
    //         }

    //         socket.emit('message.send', info);
    //     }
    // }));

    socket.on('message.number', (data) => {
        if (gameInfo.isStart <= 0) {
            let info = {
                message: "Game already stop.."
            }
            socket.emit('message.send', info);
            return;
        }

        let receiveNumber = Number(data["number"]);
        console.log("receive number : " + receiveNumber);

        if (number == receiveNumber) {
            if (gameInfo.hasWinner == 0)
            {
                gameInfo.hasWinner = 1;
                gameInfo.winner = data["owner"];

                io.emit("game.hasWinner", gameInfo);
                
                let info = {
                    message: "You win.."
                }

                socket.emit('message.send', info);

                gameInfo.isStart = 0;
                gameInfo.hasWinner = 1;

                io.emit('game.changePlayState', gameInfo);
            }
            else
            {
                let info = {
                    message: "You are too slow..."
                }

                socket.emit('message.send', info);
            }
        }
        else
        {
            let delta = receiveNumber - number;
            let highLow = ((delta) > 0) ? "High" : "Low";
            
            let info = {
                message: highLow
            }

            socket.emit('message.send', info)
        }
    });
});

console.log('server started')
