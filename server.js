const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');   

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
        tags: [],
        tagGroups: [],
        entries: []
      }, null, 2));

      return res.json({ initialized: true, message: '.tptags folder was created.' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create .tptags structure.', details: err.message });
    }
  }

  return res.json({ exists: false, message: '.tptags folder not found. Initialization skipped.' });
});

app.post('/create-tag', (req, res) => {
  const { directory, tagName } = req.body;
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

  // Generate unique 4-digit ID
  do {
    newId = Math.floor(1000 + Math.random() * 9000);
  } while (existingIDs.has(newId));

  const newTag = { name: tagName, id: newId };
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
  const { directory, groupName, tagIds } = req.body;

  try {
    const lib = loadLibrary(directory);

    // Check for unique ID
    let id;
    do {
      id = Math.floor(1000 + Math.random() * 9000);
    } while (
      lib.tags.some(t => t.id === id) || 
      lib.tagGroups.some(g => g.id === id)
    );

    const newGroup = {
      name: groupName,
      id,
      ids: tagIds
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
  console.log(`Server is running at http://localhost:${PORT}`);
});
