var COIE_Loaded = false;
var script_version = 0.1;

function sendPlayer(origin, msg)
{
  var dest = origin;
  if (origin.who)
  {
    if (playerIsGM(origin.playerid)) dest = 'GM';
    else dest = origin.who;
  }
  sendChat('COIE', '/w "' + dest + '" ' + msg);
}

function export_character(msg)
{
  var json_export = [];
  
  if (msg.selected !== undefined)
  {
    var all_characters = [];
    _.each(msg.selected, function(selection)
    {
      var token = getObj("graphic", selection._id);
      var character = getObj('character', token.get('represents'));
      
      if (character !== undefined)
      {
        all_characters.push(character);
      }
    });
    
    var cpt = 0;
    
    _.each(all_characters, function(character)
    {
      var charId = character.get('_id')
      var character_name = character.get('name');
      var export_character = {};

      export_character.character =
      {
        name : character_name,
        avatar : character.get('avatar'),
        notes : '',
        gmnotes : '',
        bio : '',
      };

      character.get("notes", function(notes)
      { // asynchronous
        if (notes.length > 0 && notes != 'null') export_character.character.notes = notes.replace(/<br>/g, '\n');

        character.get("gmnotes", function(gmnotes)
        { // asynchronous
          if (gmnotes.length > 0 && gmnotes != 'null') export_character.character.gmnotes = gmnotes.replace(/<br>/g, '\n');

          character.get("bio", function(bio)
          { // asynchronous
          if (bio.length > 0 && bio != 'null') export_character.character.bio = bio.replace(/<br>/g, '\n');

            var attributes = findObjs(
            {
              _type: 'attribute',
              _characterid: charId,
            });
            export_character.attributes = [];
            _.each(attributes, function(attribute, i)
            {
              export_character.attributes.push(
              {
                name : attribute.get('name'),
                current : attribute.get('current'),
                max : attribute.get('max')
              });
            });
            var abilities = findObjs(
            {
              _type: 'ability',
              _characterid: charId,
            });
            export_character.abilities = [];
            _.each(abilities, function(ability, i)
            {
              export_character.abilities.push(
              {
                name : ability.get('name'),
                description : ability.get('description'),
                action : ability.get('action'),
                istokenaction : ability.get('istokenaction')
              });
            });

            json_export.push(export_character);
            sendPlayer(msg, "Export " + character_name + " effectué.");

            cpt++;
            if (cpt == all_characters.length)
            {
              var this_date = (new Date()).toISOString().split('.')[0].replace('T', '-');

              // Génère une erreur :
              // "ERROR: You cannot set the imgsrc or avatar of an object unless you use an image that is in your Roll20 Library. See the API documentation for more info."
              // => c'est "normal" : https://app.roll20.net/forum/post/2405159/api-create-handout-error/?pageforid=2405587
              var this_handout = createObj("handout", 
              {
                name: 'COExport-' + this_date
              });

              this_handout.set('notes', JSON.stringify(json_export));
              sendPlayer(msg, "Export terminé.");
            }

          });
        });
      });
    });
  }
}

function import_character(msg) 
{
  var import_handouts = findObjs(
  {
    _type: 'handout',
    name: 'COImport',
  });

  import_handouts.forEach(function(import_handout, i)
  {
    import_handout.get('notes', function(json_data)
    { // asynchronous
      var all_characters = JSON.parse(json_data.trim());

      _.each(all_characters, function(character_data)
      {
        var character = character_data.character;
        var new_character = createObj("character",
        {
          name: character.name,
          avatar: character.avatar
        });
        new_character.set('notes', character.notes.replace(/\n/g, '<br>'));
        new_character.set('gmnotes', character.gmnotes.replace(/\n/g, '<br>'));
        new_character.set('bio', character.bio.replace(/\n/g, '<br>'));

        var charId = new_character.get('id');

        var attributes = character_data.attributes;
        _.each(attributes, function(attribute, i)
        {
          var new_attribute = createObj("attribute",
          {
            _characterid: charId,
            name: attribute.name,
            current: attribute.current,
            max: attribute.max
          });
        });

        var abilities = character_data.abilities;
        _.each(abilities, function(ability, i)
        {
          var new_ability = createObj("ability",
          {
            _characterid: charId,
            name: ability.name,
            description: ability.description,
            action: ability.action,
            istokenaction: ability.istokenaction
          });
        });

        sendPlayer(msg, "Import " + character.name + " effectué.");
      });
    });
  });
}

function check_command(msg)
{
  msg.content = msg.content.replace(/\s+/g, ' '); //remove duplicate whites
  var command = msg.content.split(" ", 1);
  
  switch (command[0])
  {
    case "!co-export":
      export_character(msg);
      return;
    case "!co-import":
      import_character(msg);
      return;
    default:
      return;
  }
}

on("ready", function() 
{
  COIE_Loaded = true;
  log("CO Import/Export version " + script_version + " loaded.");
});


on("chat:message", function(msg)
{
  "use strict";
  if (!COIE_Loaded || msg.type != "api") return;
  
  check_command(msg);
});