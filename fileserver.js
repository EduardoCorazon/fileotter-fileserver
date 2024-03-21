const express = require('express');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3300;


// ****************************************************************************** //
// Function 3 - List Files
// Route to list files for a specific group
// NOTE THIS HAS NO SECUIRTY ANYONE CAN CURL AND GET THIS INFO NEED TO ADD checkSession
app.get('/ListFiles/:groupName', async (req, res) => {
    const {groupName} = req.params;

    try {
        // Fetch UserList.json from groupserver
        const userListResponse = await axios.get('http://localhost:3200/userList');
        const userList = userListResponse.data;

        // Fetch GroupList.json from groupserver
        const groupListResponse = await axios.get('http://localhost:3200/groupList');
        const groupList = groupListResponse.data;

        // Find the specified group in GroupList.json
        const group = groupList[groupName];

        if (!group) {
            return res.status(404).json({error: 'Group not found'});
        }

        // Extract files for the specified group
        const files = group.files || [];
        res.json({group: groupName, files});
    } catch (error) {
        console.error('Error fetching data from groupserver:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// ****************************************************************************** //
// Function 4 - Upload

// We're using Multer since Express.js and files in memory: use Multer
// https://bytearcher.com/articles/formidable-vs-busboy-vs-multer-vs-multiparty/
// Multer config:
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'Storage/');
    },
    filename: function (req, file, cb) {
        // Tbh idk if we should keep destFile = sourceFile or name it differently on the server?
        //cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`); // give new name based on timestamp
        cb(null, file.originalname); // Use the original filename
    }
});
const upload = multer({storage: storage});

async function updateGroupList(groupName, filename) {
    try {
        const groupListResponse = await axios.get('http://localhost:3200/groupList');
        const groupList = groupListResponse.data;
        // console.log(groupList)
        // console.log(groupName)

        // check if group exists in GroupList.json
        if (!groupList[groupName]) {
            console.error('Group not found:', groupName);
            return;
        }

        // Add filename to the group's files array
        if (!groupList[groupName].files) {
            groupList[groupName].files = [];
        }
        groupList[groupName].files.push(filename);

        // Update GroupList.json on the groupserver
        await axios.post('http://localhost:3200/updateGroupList', groupList);
    } catch (error) {
        console.error('Error updating GroupList.json:', error);
    }
}

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Extract group name and filename from request
        const {groupName} = req.body;
        // console.log('Group Name:', groupName);
        const filename = req.file.filename;
        // console.log(filename)

        // Update GroupList.json on groupserver
        await updateGroupList(groupName, filename);

        // Send response
        res.json({filename});
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// ****************************************************************************** //
// Function 5 - Download
const checkGroupAccess = async (req, res, next) => {
    try {
        // Fetch GroupList.json from group server
        const groupListResponse = await axios.get('http://localhost:3200/groupList');
        const groupList = groupListResponse.data;
        // console.log(groupList);

        const userGroup = req.query.userGroup; // Retrieve userGroup from query parameters
        // console.log(userGroup);

        const requestedFile = req.params.filename; // Assuming filename is passed as a URL parameter
        // console.log(requestedFile);

        if (!groupList[userGroup] || !groupList[userGroup].files.includes(requestedFile)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'User does not have access to download this file.'
            });
        }

        // Pass userGroup to the next middleware or route handler
        req.userGroup = userGroup;
        next();
    } catch (error) {
        console.error('Error checking group access:', error);
        return res.status(500).json({error: 'Internal server error'});
    }
};

app.get('/download/:filename', checkGroupAccess, (req, res) => {
    const filename = req.params.filename;
    const userGroup = req.query.userGroup;
    const filePath = path.join(__dirname, 'Storage', filename);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({error: 'File not found'});
    }

    // Send the file as an attachment
    res.download(filePath, filename, (err) => {
        if (err) {
            console.error('Error downloading file:', err);
            res.status(500).json({error: 'Internal server error'});
        }
    });
});

// ------------------------------------------------------------------------------
//start
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});