# Railway Multi-Room Deployment

The Docker image reads configuration from environment variables. Railway
variables override values from `/bot/cfg/config.json`.

## Required variables for a second room

```text
BOT_USER4=second_room_bot_username
BOT_PASSWORD4=second_room_bot_password
BOT_ROOM2_KEY=veratown-park
BOT_ROOM2_NAME=Veratown Park
BOT_ROOM2_DESCRIPTION=Veratown Park
BOT_ROOM2_BACKGROUND=PartyBasement
BOT_ROOM2_PRIVATE=true
BOT_ROOM2_LOCKED=false
BOT_ROOM2_SPACE=X
BOT_ROOM2_LIMIT=20
BOT_ROOM2_LANGUAGE=EN
BOT_ROOM2_ADMIN=250927,254890
BOT_ROOM2_MAP_TYPE=Always
```

These scalar variables are the Railway-friendly alternative to `BOT_ROOMS`;
the application assembles them into the room profile internally. The key is
the persistent MongoDB scope and the name is the visible Bondage Club room
name. `BOT_ROOM2_ADMIN` accepts either comma-separated values or a JSON array,
for example `250927,254890` or `[250927,254890]`.

The existing variables remain unchanged:

```text
BOT_USER
BOT_PASSWORD
BOT_USER2
BOT_PASSWORD2
BOT_USER3
BOT_PASSWORD3
BOT_ENV=live
BOT_GAME=veratown
MONGODB_URI
MONGODB_DB=ropeybot
MONGODB_TLS=true
SUPERUSERS=[...]
MEMBERS=[...]
```

`ROOM_*` variables configure only the main room. `BOT_ROOMS` remains supported
for Docker environments that can provide JSON safely, but should not be used
in Railway for this setup. The map layout itself is persisted in MongoDB when
the room's in-game map save command is used; `MapData` only supplies the room's
initial map mode.

## Railway dashboard

1. Open the `veratown` service in the `production` environment.
2. Add `BOT_USER4`, `BOT_PASSWORD4`, and the `BOT_ROOM2_*` variables under Variables.
3. Redeploy the service.
4. Confirm the logs contain `Second room connection established`.

The second runtime is initialized with the `veratown-park` room key, including
room-scoped maps, locations, keypad doors, and keypad groups.

## Security

Store account passwords, Discord tokens, and MongoDB URIs as Railway secret
variables. Rotate any credentials that have been copied into source files,
logs, or chat history.
