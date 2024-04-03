const express = require('express')
const app = express()

const sqlite3 = require('sqlite3')
const {open} = require('sqlite')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Started at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

initializeDBAndServer()

//AUTHENTICATION

const authorizationToken = (request, response, next) => {
  let jwtToken
  const authHearder = request.headers['authorization']
  if (authHearder !== undefined) {
    jwtToken = authHearder.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_CODE_', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.payload = payload
        next()
      }
    })
  }
}

//API-1 - REGISTER

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const isUserAvailQuery = `SELECT * FROM user 
    WHERE username = '${username}';`
  const isUserAvail = await db.get(isUserAvailQuery)

  if (isUserAvail === undefined) {
    if (password.length >= 6) {
      const hashedPassword = await bcrypt.hash(password, 10)
      const regUserQuery = `
            INSERT INTO user(name,username,password,gender)
            VALUES (
                '${name}','${username}','${hashedPassword}',
            '${gender}')`
      await db.run(regUserQuery)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API-2 LOGIN

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const isUserAvailQuery = `SELECT * FROM user 
    WHERE username = '${username}';`
  const isUserAvail = await db.get(isUserAvailQuery)

  if (isUserAvail === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isValidPassword = await bcrypt.compare(password, isUserAvail.password)

    if (isValidPassword === true) {
      const jwtToken = jwt.sign(isUserAvail, 'MY_SECRET_CODE_')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API-3

app.get('/user/tweets/feed/', authorizationToken, async (request, response) => {
  const {payload} = request
  const {username, user_id, name, gender} = payload
  const feedQuery = `
  SELECT 
    username,
    tweet,
    date_time AS dateTime
  FROM tweet INNER JOIN user 
    ON tweet.user_id = user.user_id INNER JOIN follower 
    ON tweet.user_id = follower.following_user_id
  WHERE 
    follower.follower_user_id = ${user_id}
  ORDER BY date_time DESC LIMIT 4`
  const recentFeed = await db.all(feedQuery)
  response.send(recentFeed)
})

//API-4

app.get('/user/following/', authorizationToken, async (request, response) => {
  const {payload} = request
  const {username, user_id, name, gender} = payload
  const usersFollowingQuery = `
  SELECT name 
  FROM follower INNER JOIN user 
  ON follower.following_user_id = user.user_id
  WHERE follower.follower_user_id = ${user_id}`

  const usersFollowing = await db.all(usersFollowingQuery)

  response.send(usersFollowing)
})

//API-5

app.get('/user/followers/', authorizationToken, async (request, response) => {
  const {payload} = request
  const {username, user_id, name, gender} = payload
  const usersFollowerQuery = `
  SELECT name 
  FROM follower INNER JOIN user 
  ON follower.follower_user_id = user.user_id
  WHERE follower.following_user_id = ${user_id}`

  const usersFollower = await db.all(usersFollowerQuery)

  response.send(usersFollower)
})

//API-6

app.get('/tweets/:tweetId/', authorizationToken, async (request, response) => {
  const {tweetId} = request.params
  const {payload} = request
  const {username, user_id, name, gender} = payload
  const usersFollowingQuery = `
    SELECT following_user_id	 
    FROM follower INNER JOIN user 
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id}`
  const usersFollowing = await db.all(usersFollowingQuery)

  const tweetedUserQuery = `SELECT user_id FROM tweet
    WHERE tweet_id = ${tweetId}`
  const tweetedUser = await db.get(tweetedUserQuery)

  /*const ans = user => {
    return user.following_user_id === tweetedUser.user_id
  }

  console.log(usersFollowing.some(ans))*/

  if (
    usersFollowing.some(item => item.following_user_id === tweetedUser.user_id)
  ) {
    const tweetDetailsQuery = `
      SELECT 
        tweet,
        COUNT(DISTINCT(like_id)) AS likes,
        COUNT(DISTINCT(reply_id)) AS replies,
        date_time AS dateTime
      FROM tweet INNER JOIN reply 
      ON tweet.tweet_id=reply.tweet_id INNER JOIN like
      ON tweet.tweet_id =like.tweet_id
      WHERE tweet.tweet_id = ${tweetId}`

    const tweetDetails = await db.get(tweetDetailsQuery)

    //console.log(tweetDetails)

    response.send(tweetDetails)
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//API-7

app.get(
  '/tweets/:tweetId/likes/',
  authorizationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {payload} = request
    const {username, user_id, name, gender} = payload
    const usersFollowingQuery = `
    SELECT following_user_id	 
    FROM follower INNER JOIN user 
    ON follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id}`
    const usersFollowing = await db.all(usersFollowingQuery)

    //console.log(usersFollowing)

    const tweetedUserQuery = `SELECT user_id FROM tweet
  WHERE tweet_id = ${tweetId}`
    const tweetedUser = await db.get(tweetedUserQuery)

    //console.log(tweetedUser)

    if (
      usersFollowing.some(
        item => item.following_user_id === tweetedUser.user_id,
      )
    ) {
      const tweetLikesQuery = `
      SELECT username FROM like INNER JOIN user ON like.user_id = user.user_id
      INNER JOIN tweet ON tweet.tweet_id = like.tweet_id
      WHERE tweet.tweet_id = ${tweetId}`
      const tweetLikes = await db.all(tweetLikesQuery)

      //console.log(tweetLikes)

      /*const ans = item => {
        return item.name
      }

      const nameArray = tweetLikes.map(eachItem => ans(eachItem))
      //console.log(nameArray)*/

      if (tweetLikes.length !== 0) {
        let likes = []
        for (let item of tweetLikes) {
          likes.push(item.username)
        }
        response.send({likes})
      }

      /*const res = array => {
        return {
          likes: array,
        }
      }
      //console.log(res(nameArray))

      response.send(res(nameArray))*/
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-8

app.get(
  '/tweets/:tweetId/replies/',
  authorizationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {payload} = request
    const {username, user_id, name, gender} = payload
    const usersFollowingQuery = `
  SELECT following_user_id	 
  FROM follower INNER JOIN user 
  ON follower.following_user_id = user.user_id
  WHERE follower.follower_user_id = ${user_id}`
    const usersFollowing = await db.all(usersFollowingQuery)

    //console.log(usersFollowing)

    const tweetedUserQuery = `SELECT user_id FROM tweet
  WHERE tweet_id = ${tweetId}`
    const tweetedUser = await db.get(tweetedUserQuery)

    //console.log(tweetedUser)

    if (
      usersFollowing.some(
        item => item.following_user_id === tweetedUser.user_id,
      )
    ) {
      const tweetRepliesQuery = `
    SELECT name,reply FROM reply INNER JOIN user ON reply.user_id = user.user_id
    INNER JOIN tweet ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.tweet_id = ${tweetId}`
      const tweetReplies = await db.all(tweetRepliesQuery)

      //console.log(tweetReplies)

      if (tweetReplies.length !== 0) {
        let replies = []
        for (let item of tweetReplies) {
          let object = {
            name: item.name,
            reply: item.reply,
          }
          replies.push(object)
        }
        response.send({replies})
      }
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API-9

app.get('/user/tweets/', authorizationToken, async (request, response) => {
  const {payload} = request
  const {user_id, username, name, gender} = payload
  const usersTweetQuery = `
    SELECT 
      tweet.tweet AS tweet,
      COUNT(DISTINCT(like.like_id)) AS likes,
      COUNT(DISTINCT(reply.reply_id)) AS replies,
      tweet.date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id INNER JOIN like
     ON tweet.tweet_id = like.tweet_id INNER JOIN reply
     ON tweet.tweet_id = reply.tweet_id
    WHERE user.user_id= ${user_id}
    GROUP BY tweet.tweet_id`

  const usersTweet = await db.all(usersTweetQuery)
  response.send(usersTweet)
})

//API-10

app.post('/user/tweets/', authorizationToken, async (request, response) => {
  const {tweet} = request.body
  const {payload} = request
  const {user_id, username, name, gender} = payload

  const tweetQuery = `INSERT INTO tweet(tweet,user_id)
    VALUES('${tweet}',${user_id})`

  await db.run(tweetQuery)
  response.send('Created a Tweet')
})

//API-11

app.delete(
  '/tweets/:tweetId',
  authorizationToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {payload} = request
    const {user_id, username, name, gender} = payload

    const selectedUserQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId} AND user_id=${user_id}`
    const selectedUser = await db.get(selectedUserQuery)
    //console.log(selectedUser)

    if (selectedUser === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId} AND user_id=${user_id}`

      await db.run(deleteQuery)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
