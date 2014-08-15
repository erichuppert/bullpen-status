var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var MongoClient = require('mongodb').MongoClient;
var app = express();
var teamCodes = [
	'oak', 'ana', 'sea', 'tex', 'hou',
	'det', 'min', 'cws', 'kc', 'cle',
	'tor', 'nyy', 'bos', 'bal', 'tb',
	'sf', 'col', 'la', 'sd', 'ari',
	'mil', 'stl', 'pit', 'cin', 'chc',
	'atl', 'mia', 'was', 'nym', 'phi' 
];
//
MongoClient.connect('mongodb://eric:baseball1@ds035358.mongolab.com:35358/bullpen-status', function(err, db) {
// MongoClient.connect('mongodb://localhost:27017/bullpen-status', function(err, db) {
	// listen on port 3000 or env port
	app.set('port', process.env.PORT || 3000);
	app.listen(app.get('port'));
	console.log('Listening on port ' + app.get('port'));

    if(!err) {
        console.log("Connected to 'bullpen-status' database");
    }
	app.all('/', function(req, res, next) {
		res.header("Access-Control-Allow-Origin", "*");
		res.header("Access-Control-Allow-Headers", "X-Requested-With");
		next();
	});

	// ping test
	app.get('/', function(req, res){
		res.json({message: 'Success!'})
	});

	app.get('/games', function(req, res){
		getGameIndex(today, function(date, data){
			res.json(data);
		})
	})

	app.get('/:teamCode', function(req, res) {
		var teamCode = req.params.teamCode;
		if (teamCodes.indexOf(teamCode) < 0 ) {
			res.send(404);
		}
		getTeamData(teamCode, function(err, data) {
			if (err) {
				res.send(500);
			} else {
				res.json(data);
			}
		})
	})


    function getTeamData(teamCode, callback) {
    	if (teamCodes.indexOf(teamCode) >= 0) {
			var resData = {team: teamCode, pitchers: [], startDate: isoDate(startDate), endDate: isoDate(new Date())}
			db.collection('currentBullpen').findOne({team: teamCode}, function(err, data) {
				if (!err && data) {
					var pitchers = data.pitchers;
					for (var i=0; i < pitchers.length; i++) {
						var pitcher = pitchers[i];
						getPitcherName(pitcher, function(pid, name){
							getPitchCount(pid, startDate, function(pc) {
								var pitcherData = {name: name, id: pid, pitchCounts: pc};
								resData.pitchers.push(pitcherData);
								if (resData.pitchers.length == pitchers.length) {
									callback(false, resData)
								}
							})
						})
					}
				} else {
					// there was an error
					callback(true, null);
				}
			})
		}
    }

	function getBullpen(teamCode, callback) {
		var url = "http://oakland.athletics.mlb.com/team/depth_chart/index.jsp?c_id=" + teamCode;
		request(url, function(error, response, html) {
			if (!error) {
				var $ = cheerio.load(html);
				var pitcherLIs =  $('#pos_P ul').children().slice(1); // remove header
				var pitcherIDs = [];
				pitcherLIs.each(function(i, e) {
					var childLink = $(this).children('a');
					pitcherIDs.push(childLink.attr("href").slice(-6));
				});
				callback(teamCode, pitcherIDs);
			} else {
				throw error;
			}
		});
	}

	function getPitchCount(id, dateSince, callback) {
		db.collection('pitchCounts').find({id: id, date: {$gte: dateSince}}).toArray(function(err, data) {
			data = data.map(function(a) {
				return {date: isoDate(a.date), np: a.np};
			})
			var dateRange = getDates(dateSince, new Date());
			var pitchesByDay = dateRange.map(function(a) {
				var pitchCountDate = data.filter(function(b) { return b.date === isoDate(a)});
				if (pitchCountDate.length > 0) {
					return pitchCountDate[0];
				} else {
					return {date: isoDate(a), np: null}
				}
			})
			if (!err) {
				if (data != null) {
					callback(pitchesByDay);
				} else {
					callback([]);
				}
			} else {
				return null;
			}
		})
	}

	function getPitcherName(id, callback) {
		db.collection('pitchers').findOne({id: id}, function(err, data) {
			if (!err) {
				callback(data.id, data.name);
			} else {
				return null;
			}
		})
	}

	function getGameIndex(date, callback) {
		var url = "http://gd2.mlb.com/components/game/mlb/year_" + date.getFullYear() 
			+ "/month_" + dateLeadingZero(date.getMonth() + 1) + "/day_" + dateLeadingZero(date.getDate()) + "/miniscoreboard.json";
		request(url, function(error, response, body) {
			scoreboard = JSON.parse(body);
			games = scoreboard.data.games.game.map(function(game) {
				return {
					home_team: game.home_team_city,
					away_team: game.away_team_city,
					away_team_code: game.away_file_code,
					home_team_code: game.home_file_code,
					home_score: game.home_team_runs,
					away_score: game.away_team_runs,
					status: game.ind,
					inning: game.inning,
					game_time: game.time_date
				}
			})
			callback(date, games);
		});	
	}

	// returns a number that is two digits (adds leading "0" to single digit numbers)
	function dateLeadingZero(num) {
		if (num >= 10) {
			return num.toString();
		} else {
			return "0" + num.toString();
		}
	}

	function getGames(date, callback) {
		var url = "http://gd2.mlb.com/components/game/mlb/year_" + date.getFullYear() 
			+ "/month_" + dateLeadingZero(date.getMonth() + 1) + "/day_" + dateLeadingZero(date.getDate()) + "/miniscoreboard.json";
		request(url, function(error, response, body) {
			scoreboard = JSON.parse(body);
			var gameURLS = [];
			console.log(scoreboard.data.games.game);
			if (scoreboard.data.games.game) {
				if (Array.isArray(scoreboard.data.games.game)){
					gameURLS = scoreboard.data.games.game.map(function(game){ return "http://gd2.mlb.com" + game.game_data_directory + "/boxscore.json" })
				} else {
					// there is only one game in this case
					gameURLS = ["http://gd2.mlb.com" + scoreboard.data.games.game.game_data_directory + "/boxscore.json" ];
				}
			}
			callback(date, gameURLS);
		});	
	}

	function getPitchCounts(boxURL, callback) {
		request(boxURL, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				var boxscore = JSON.parse(body).data.boxscore;
				var pitchCounts = [];
				for (var i=0; i < boxscore.pitching.length; i++) {
					var teamPitching = boxscore.pitching[i]; 
					if (Array.isArray(teamPitching.pitcher)) {
						var teamPitchCounts = teamPitching.pitcher.map(function(pitcher) {
							return {id: pitcher.id, np: parseInt(pitcher.np)}
						});
						pitchCounts = pitchCounts.concat(teamPitchCounts);
					} else {
						pitchCounts.push({id: teamPitching.pitcher.id, np: parseInt(teamPitching.pitcher.np)});
					}
				}
				callback(pitchCounts);
			}
		})
	}

	function addPitcher(id) {
		db.collection('pitchers').count({id: id}, function(err, count) {
			if (count == 0) {
				var url = "http://m.athletics.mlb.com/player/" + id;
				request(url, function(error, response, html) {
					var $ = cheerio.load(html);
					var playerName = $(".player-attributes h3").text();
					db.collection('pitchers').insert({id: id, name: playerName}, function (err, result) {
						if (err) throw err;
					});
				})
			}
		})
	}

	function isoDate(date) {
		return date.getFullYear() + "-" + dateLeadingZero(date.getMonth() + 1) + "-" + dateLeadingZero(date.getDate());
	}

	function update(date) {
		console.log('inside update');
		for (var i=0; i< teamCodes.length; i++) {
			var teamCode = teamCodes[i];
			getBullpen(teamCode, function(teamCode, pitcherIDs) {
				db.collection('currentBullpen').update({team: teamCode}, {team: teamCode, pitchers: pitcherIDs}, {upsert: true}, function(err, result) {
					if (err) throw err;
				});
				for (var j=0; j<pitcherIDs.length; j++) {
					addPitcher(pitcherIDs[j]);
				}
			})
		}
		getGames(date, function(date2, gameURLs) {
			for (var i = 0; i < gameURLs.length; i++) {
				var gameURL = gameURLs[i];
				getPitchCounts(gameURL, function(pitchCounts) {
					for (var j = 0; j < pitchCounts.length; j++ ) {
						var pitchCount = pitchCounts[j];
						pitchCount.date = date2;
						db.collection("pitchCounts").update({id: pitchCount.id, date: date}, pitchCount, {upsert: true}, function (err, result) {
							if (err) throw err;
						});
					}
				})
			}
		})
		console.log('finished updating');
	}

	Date.prototype.addDays = function(days) {
	    var dat = new Date(this.valueOf())
	    dat.setDate(dat.getDate() + days);
	    return dat;
	}

	function getDates(startDate, stopDate) {
	    var dateArray = [];
	    var currentDate = startDate;
	    while (currentDate <= stopDate) {
	        dateArray.push( new Date (currentDate) )
	        currentDate = currentDate.addDays(1);
	    }
	    return dateArray;
	}

	var currentStatus = {}
	var today = new Date();
	today.setHours(0,0,0,0);
	var startDate = today.addDays(-7);
	var dates = getDates(startDate, today);
	for (var i=0; i<dates.length; i++) {
		update(dates[i]);
	}
	// update every 3 minutes
	setInterval(update, 180000, today);
});
