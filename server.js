const express = require("express");
const path = require("path");
let app = express();
let server = app.listen(process.env.PORT || 3000, function () {
    console.info("Listening on port 3000");
});
const fs = require("fs");
const fileUpload = require("express-fileupload");
const io = require("socket.io")(server, {
    allowEIO3: true // false by default
});
app.use(express.static(path.join(__dirname, "")));
let userConnections = [];
io.on("connection", (socket) => {
    console.log("socket id is ", socket.id);
    socket.on("userconnect", data => {
        console.log("userconnect", data.displayName, data.meetingid);
        let other_users = userConnections.filter(p => p.meeting_id == data.meetingid);
        userConnections.push({
            connectionId: socket.id,
            user_id: data.displayName,
            meeting_id: data.meetingid
        });
        let userCount = userConnections.length;
        console.log(userCount);
        other_users.forEach(v => {
            socket.to(v.connectionId).emit("inform_others_about_me", {
                other_user_id: data.displayName,
                connId: socket.id,
                userNumber: userCount
            });
        });

        socket.emit("inform_me_about_other_user", other_users);
    });

    socket.on("SDPProcess", data => {
        socket.to(data.to_connid).emit("SDPProcess", {
            message: data.message,
            from_connid: socket.id
        });
    });

    socket.on("sendMessage", msg => {
        console.log(msg);
        let mUser = userConnections.find(p => p.connectionId == socket.id);
        if (mUser) {
            let  meetingid = mUser.meeting_id;
            let from = mUser.user_id;
            let list = userConnections.filter(p => p.meeting_id == meetingid);
            list.forEach(v => {
                socket.to(v.connectionId).emit("showChatMessage", {
                    from: from,
                    message: msg
                });
            });
        }
    });

    socket.on("fileTransefToOther", msg => {
        console.log(msg);
        let mUser = userConnections.find(p => p.connectionId == socket.id);
        if (mUser) {
            let  meetingid = mUser.meeting_id;
            let from = mUser.user_id;
            let list = userConnections.filter(p => p.meeting_id == meetingid);
            list.forEach(v => {
                socket.to(v.connectionId).emit("showFileMessage", {
                    username: msg.username,
                    meetingid: msg.meetingid,
                    filePath: msg.filePath,
                    fileName: msg.fileName
                });
            });
        }
    });

    socket.on("disconnect", function () {
        console.log("Disconnected");
        let disUser = userConnections.find(p => p.connectionId == socket.id);
        if (disUser) {
            let meetingid = disUser.meeting_id;
            userConnections = userConnections.filter(p => p.connectionId != socket.id);
            let list = userConnections.filter(p => p.meeting_id == meetingid);
            list.forEach(v => {
                let userNumberAffUserLeave = userConnections.length;
                socket.to(v.connectionId).emit("inform_other_about_disconnected_user", {
                    connId: socket.id,
                    uNumber: userNumberAffUserLeave
                });
            });
        }
    });

});

app.use(fileUpload());

app.post("/attachimg", function (req, res) {
    let data = req.body;
    let imageFile = req.files.zipfile;
    console.log(imageFile);
    let dir = "public/attachment/" + data.meeting_id + "/";
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    imageFile.mv(dir + imageFile.name, function (error) {
        if (error) {
            console.log("Couldn't upload the image file, error: " + error);
        } else {
            console.log("Image file successfully uploaded");
        }
    });
});
