const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static('public'));

function getLibraryPath(directory) {
  return path.join(directory, '.tptags', 'library.json');
}

function loadLibrary(directory) {
  const libPath = getLibraryPath(directory);
  if (!fs.existsSync(libPath)) {
    return { tags: [], tagGroups: [], entries: [] };
  }
  return JSON.parse(fs.readFileSync(libPath, 'utf8'));
}

function saveLibrary(directory, data) {
  const libPath = getLibraryPath(directory);
  fs.writeFileSync(libPath, JSON.stringify(data, null, 2));
}


// Check and optionally initialize .tptags folder
app.post('/check-directory', (req, res) => {
  const { directory, initialize } = req.body;
  const tpTagsPath = path.join(directory, '.tptags');

  if (fs.existsSync(tpTagsPath)) {
    return res.json({ exists: true, message: '.tptags folder already exists.' });
  }

  if (initialize) {
    try {
      fs.mkdirSync(tpTagsPath, { recursive: true });
      fs.mkdirSync(path.join(tpTagsPath, 'backups'));
      fs.mkdirSync(path.join(tpTagsPath, 'thumbnails'));

      const libraryJsonPath = path.join(tpTagsPath, 'library.json');
      fs.writeFileSync(libraryJsonPath, JSON.stringify({
      "tags": [
        {
          "name": "jpg",
          "aliases": ["jpeg"],
          "id": "1842"
        },
        {
          "name": "png",
          "aliases": [],
          "id": "9271"
        },
        {
          "name": "gif",
          "aliases": [],
          "id": "3405"
        },
        {
          "name": "webp",
          "aliases": [],
          "id": "6509"
        },
        {
          "name": "bmp",
          "aliases": ["bitmap"],
          "id": "7032"
        },
        {
          "name": "tiff",
          "aliases": ["tif"],
          "id": "8654"
        },
        {
          "name": "svg",
          "aliases": ["svgz"],
          "id": "1127"
        },
        {
          "name": "heic",
          "aliases": ["heif"],
          "id": "5930"
        },
        {
          "name": "ico",
          "aliases": ["icon"],
          "id": "7783"
        },
        {
          "name": "avif",
          "aliases": [],
          "id": "4516"
        },
        {
          "name": "mp4",
          "aliases": ["m4v"],
          "id": "2398"
        },
        {
          "name": "webm",
          "aliases": [],
          "id": "3806"
        },
        {
          "name": "mov",
          "aliases": ["qt"],
          "id": "9612"
        },
        {
          "name": "avi",
          "aliases": [],
          "id": "3247"
        },
        {
          "name": "mkv",
          "aliases": [],
          "id": "4065"
        },
        {
          "name": "flv",
          "aliases": [],
          "id": "1940"
        },
        {
          "name": "mpeg",
          "aliases": ["mpg"],
          "id": "8123"
        },
        {
          "name": "3gp",
          "aliases": [],
          "id": "6681"
        },
        {
          "name": "wmv",
          "aliases": [],
          "id": "5572"
        },
        {
          "name": "favorites",
          "aliases": [],
          "id": "8937"
        }
      ],
      "tagGroups": [
        {
          "name": "image",
          "aliases": [],
          "id": "9001",
          "ids": [
            "1842",
            "9271",
            "3405",
            "6509",
            "7032",
            "8654",
            "1127",
            "5930",
            "7783",
            "4516"
          ]
        },
        {
          "name": "video",
          "aliases": [],
          "id": "9002",
          "ids": [
            "2398",
            "3806",
            "9612",
            "3247",
            "4065",
            "1940",
            "8123",
            "6681",
            "5572"
          ]
        }
      ],
      "entries": []
    }
    , null, 2));

      return res.json({ initialized: true, message: '.tptags folder was created.' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create .tptags structure.', details: err.message });
    }
  }

  return res.json({ exists: false, message: '.tptags folder not found. Initialization skipped.' });
});

app.post('/create-tag', (req, res) => {
  const { directory, tagName, aliases = [] } = req.body;
  const libraryPath = path.join(directory, '.tptags', 'library.json');

  if (!fs.existsSync(libraryPath)) {
    return res.status(400).json({ error: 'library.json not found.' });
  }

  let libraryData;
  try {
    libraryData = JSON.parse(fs.readFileSync(libraryPath));
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read or parse library.json.' });
  }

  const existingIDs = new Set(libraryData.tags.map(tag => tag.id));
  let newId;
  do {
    newId = Math.floor(1000 + Math.random() * 9000);
  } while (existingIDs.has(String(newId)));

  const newTag = { name: tagName, id: String(newId), aliases };
  libraryData.tags.push(newTag);

  try {
    fs.writeFileSync(libraryPath, JSON.stringify(libraryData, null, 2));
    return res.json({ success: true, tag: newTag });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to save new tag.' });
  }
});

app.post('/get-tags', (req, res) => {
  const { directory } = req.body;
  const libraryPath = path.join(directory, '.tptags', 'library.json');

  if (!fs.existsSync(libraryPath)) {
    return res.status(400).json({ error: 'library.json not found.' });
  }

  try {
    const data = JSON.parse(fs.readFileSync(libraryPath));
    return res.json({ tags: data.tags || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read library.json.' });
  }
});

app.post('/delete-tag', (req, res) => {
  const { directory, tagId, force } = req.body;

  try {
    const lib = loadLibrary(directory);
    const tagIndex = lib.tags.findIndex(tag => tag.id === tagId);

    if (tagIndex === -1) {
      return res.json({ success: false, error: 'Tag not found.' });
    }

    // Check what groups use this tag
    const groupsContainingTag = lib.tagGroups.filter(group => group.ids.includes(tagId));

    if (groupsContainingTag.length > 0 && !force) {
      return res.json({
        success: false,
        requiresConfirmation: true,
        groups: groupsContainingTag.map(g => ({ id: g.id, name: g.name }))
      });
    }

    // Delete tag
    lib.tags.splice(tagIndex, 1);

    // Remove tag from any groups
    lib.tagGroups.forEach(group => {
      group.ids = group.ids.filter(id => id !== tagId);
    });

    saveLibrary(directory, lib);
    res.json({ success: true });

  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/get-tag-groups', (req, res) => {
  const { directory } = req.body;
  try {
    const lib = loadLibrary(directory);
    res.json({ success: true, groups: lib.tagGroups || [] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/create-tag-group', (req, res) => {
  const { directory, groupName, tagIds, aliases = [] } = req.body;

  try {
    const lib = loadLibrary(directory);
    let id;
    do {
      id = Math.floor(1000 + Math.random() * 9000);
    } while (
      lib.tags.some(t => t.id === id) || 
      lib.tagGroups.some(g => g.id === id)
    );

    const newGroup = {
      name: groupName,
      id: String(id),
      ids: tagIds.map(String),
      aliases
    };

    lib.tagGroups.push(newGroup);
    saveLibrary(directory, lib);

    res.json({ success: true, group: newGroup });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/delete-tag-group', (req, res) => {
  const { directory, groupId } = req.body;

  try {
    const lib = loadLibrary(directory);
    const index = lib.tagGroups.findIndex(g => g.id === groupId);

    if (index === -1) {
      return res.json({ success: false, error: 'Group not found.' });
    }

    lib.tagGroups.splice(index, 1);
    saveLibrary(directory, lib);

    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  const platform = os.platform();
  if (platform === 'win32') {
    exec(`start ${url}`);
  } else if (platform === 'darwin') {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
});