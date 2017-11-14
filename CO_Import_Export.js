var COIE_Loaded = false;
var script_version = 0.2;

function sendPlayer(origin, msg) {
	var dest = origin;
	if (origin.who) {
		if (playerIsGM(origin.playerid)) dest = 'GM';
		else dest = origin.who;
	}
	sendChat('COIE', '/w "' + dest + '" ' + msg);
}

function turn_action(msg) {
	if (msg.selected !== undefined) {
		var all_characters = [];
		_.each(msg.selected, function(selection) {
			var token = getObj("graphic", selection._id);
			if (token !== undefined) {
				var character = getObj('character', token.get('represents'));
				if (character !== undefined) {
					all_characters.push(character);
				}
			}
		});

		var cpt = 0;

		_.each(all_characters, function(character) {
			var charId = character.get('_id');
			var abilities = findObjs({
				_type: 'ability',
				_characterid: charId,
			});

			var turn_action = abilities.filter(function(obj) {
				var attrName = obj.get('name');
				return (obj.get('name') == '#TurnAction#');
			});

			if (turn_action.length == 0) {
				var action = '';

				_.each(abilities, function(ability, i) {
					action += '%' + ability.get('name') + '\n';
					ability.set('istokenaction', false);
				});

				var new_ability = createObj("ability", {
					_characterid: charId,
					name: '#TurnAction#',
					description: '',
					action: action,
					istokenaction: false
				});
			}
		});
	}
}

function export_character(msg) {
	var json_export = [];

	// Toutes les Macros
	var macros = findObjs({
		_type: 'macro'
	});

	if (msg.selected !== undefined) {
		var all_characters = [];
		_.each(msg.selected, function(selection) {
			var token = getObj("graphic", selection._id);
			if (token !== undefined) {
				var character = getObj('character', token.get('represents'));
				if (character !== undefined) {
					all_characters.push(character);
				}
			}
		});

		var cpt = 0;

		_.each(all_characters, function(character) {
			var charId = character.get('_id')
			var character_name = character.get('name');
			var export_character = {};

			export_character.character = {
				name: character_name,
				avatar: character.get('avatar'),
				notes: '',
				gmnotes: '',
				bio: '',
			};

			character.get("notes", function(notes) { // asynchronous
				if (notes.length > 0 && notes != 'null') export_character.character.notes = notes.replace(/<br>/g, '\n');

				character.get("gmnotes", function(gmnotes) { // asynchronous
					if (gmnotes.length > 0 && gmnotes != 'null') export_character.character.gmnotes = gmnotes.replace(/<br>/g, '\n');

					character.get("bio", function(bio) { // asynchronous
						if (bio.length > 0 && bio != 'null') export_character.character.bio = bio.replace(/<br>/g, '\n');

						var attributes = findObjs({
							_type: 'attribute',
							_characterid: charId,
						});
						export_character.attributes = [];
						_.each(attributes, function(attribute, i) {
							export_character.attributes.push({
								name: attribute.get('name'),
								current: attribute.get('current'),
								max: attribute.get('max')
							});
						});
						var abilities = findObjs({
							_type: 'ability',
							_characterid: charId,
						});
						export_character.abilities = [];
						_.each(abilities, function(ability, i) {

							var action = ability.get('action').trim();

							if (action.indexOf('#') !== -1) {
								// Cette commande contient au moins une macro donc on va le remplacer par sa commande (action)
								var command_words = action.split("\n");
								//chaque ligne
								_.each(command_words, function(line, j) {
									var line_words = line.split(' ');
									//chaque mot
									_.each(line_words, function(word, k) {
										// si le mot commence par #
										if (word.startsWith('#')) {
											// on recherche une macro qui s'appelle pareil (sans le #)
											var this_macro = macros.filter(function(obj) {
												return (obj.get('name').trim() == word.substring(1));
											});
											if (this_macro.length == 1) {
												// macro trouvé
												// on replace dans la commande initiale
												action = action.replace(word, this_macro[0].get('action'));
											}
										}
									});
								});
							}

							export_character.abilities.push({
								name: ability.get('name'),
								description: ability.get('description'),
								action: action,
								istokenaction: ability.get('istokenaction')
							});
						});

						json_export.push(export_character);
						sendChat('COIE', '/w gm Export ' + character_name + ' effectué.');

						cpt++;
						if (cpt == all_characters.length) {
							// Génère une erreur :
							// "ERROR: You cannot set the imgsrc or avatar of an object unless you use an image that is in your Roll20 Library. See the API documentation for more info."
							// => c'est "normal" : https://app.roll20.net/forum/post/2405159/api-create-handout-error/?pageforid=2405587
							var this_handout = createObj("handout", {
								name: 'COExport_' + msg.date
							});

							this_handout.set('notes', JSON.stringify(json_export));
							sendChat('COIE', '/w gm Export terminé.');
						}

					});
				});
			});
		});
	}
}

function parse_charac(MOD, line) {
	var characteristic = 0;

	line = line.split(MOD + ' ');
	if (line[1] !== undefined) {
		var value = line[1].trim();
		if (value.indexOf(' ')) value = value.split(' ')[0];
		if (value.indexOf('+') !== -1) value = value.split('+')[1];
		characteristic = value.trim();
	}

	return parseInt(characteristic);
}

function get_valeur(Mod, line) {
	return parseInt(10 + 2 * Mod);
}

function import_character() {
	var import_handouts = findObjs({
		_type: 'handout',
		name: 'COImport',
	});

	// Toutes les personnages
	var existing_characters = findObjs({
		_type: 'character'
	});

	var Added_Characters = [];

	import_handouts.forEach(function(import_handout, i) {
		import_handout.get('notes', function(notes) { // asynchronous
			try {
				var all_characters = JSON.parse(notes.replace(/<br>/g, '').trim());

				_.each(all_characters, function(character_data) {
					var character = character_data.character;

					// On recherche si un personnage existe déja avec le même nom
					// En cas, on ne l'ajoute pas
					var character_exists = existing_characters.filter(function(obj) {
						return (obj.get('name').trim() == character.name.trim());
					});

					if (character_exists.length > 0) {
						// Un personnage avec le même nom existe déja.
						sendChat('COIE', '/w gm ' + character.name + ' existe déjà. Import annulé.');
					} else {
						// Aucun personnage avec le même nom n'existe => On peut l'ajouter
						var new_character = createObj("character", {
							name: character.name,
							avatar: character.avatar
						});
						new_character.set('notes', character.notes.replace(/\n/g, '<br>'));
						new_character.set('gmnotes', character.gmnotes.replace(/\n/g, '<br>'));
						new_character.set('bio', character.bio.replace(/\n/g, '<br>'));

						var charId = new_character.get('id');

						var attributes = character_data.attributes;
						_.each(attributes, function(attribute, i) {
							var new_attribute = createObj("attribute", {
								_characterid: charId,
								name: attribute.name,
								current: attribute.current,
								max: attribute.max
							});
						});

						var abilities = character_data.abilities;
						_.each(abilities, function(ability, i) {
							var new_ability = createObj("ability", {
								_characterid: charId,
								name: ability.name,
								description: ability.description,
								action: ability.action,
								istokenaction: ability.istokenaction
							});
						});

						Added_Characters.push(character.name);
					}
				});
			} catch (e) {
				if (notes.indexOf('FOR ') !== -1 && notes.indexOf('DEX ') !== -1 && notes.indexOf('CON ') !== -1 && notes.indexOf('INT ') !== -1 && notes.indexOf('SAG') !== -1 && notes.indexOf('CHA ') !== -1 && notes.indexOf('DEF ') !== -1 && notes.indexOf('PV ') !== -1 && notes.indexOf('Init ') !== -1) {
					notes = notes.trim().split('<br>');
					var new_character, character = {},
						charId, attributes = [],
						FOR_MOD = 0,
						DEX = 0,
						DEX_MOD = 2,
						INIT = 0,
						cpt = 0,
						attack_contact = 0,
						attack_distance = 0,
						tmp, NIVEAU;
					_.each(notes, function(line, i) {
						if (i == 0) {
							character.name = line.trim();
							if (character.name.indexOf('(') !== -1) character.name = character.name.split('(')[0];
							new_character = createObj("character", {
								name: character.name,
							});

							charId = new_character.get('id');
						} else {
							if (line.indexOf('NC ') !== -1) {
								NIVEAU = parseInt(line.split('NC ')[1].replace(/[^0-9\.]/g, ''), 10);
								if (!NIVEAU || NIVEAU < 1) NIVEAU = 1;

								attributes.push({
									name: 'NIVEAU',
									current: NIVEAU,
									max: ''
								});
							}
							if (line.indexOf('FOR ') !== -1) {
								FOR_MOD = parse_charac('FOR', line);
								attributes.push({
									name: 'FORCE',
									current: get_valeur(FOR_MOD),
									max: ''
								});
							}
							if (line.indexOf('DEX ') !== -1) {
								DEX_MOD = parse_charac('DEX', line);
								DEX = get_valeur(DEX_MOD);
							}
							if (line.indexOf('CON ') !== -1) {
								attributes.push({
									name: 'CONSTITUTION',
									current: get_valeur(parse_charac('CON', line)),
									max: ''
								});
							}
							if (line.indexOf('INT ') !== -1) {
								attributes.push({
									name: 'INTELLIGENCE',
									current: get_valeur(parse_charac('INT', line)),
									max: ''
								});
							}
							if (line.indexOf('SAG ') !== -1) {
								attributes.push({
									name: 'SAGESSE',
									current: get_valeur(parse_charac('SAG', line)),
									max: ''
								});
							}
							if (line.indexOf('CHA ') !== -1) {
								attributes.push({
									name: 'CHARISME',
									current: get_valeur(parse_charac('CHA', line)),
									max: ''
								});
							}
							if (line.indexOf('DEF ') !== -1) {
								attributes.push({
									name: 'DEFDIV',
									current: parse_charac('DEF', line) - 10 - DEX_MOD,
									max: ''
								});
							}
							if (line.indexOf('PV ') !== -1) {
								attributes.push({
									name: 'PV',
									current: parse_charac('PV', line),
									max: parse_charac('PV', line)
								});
							}
							if (line.indexOf('(RD ') !== -1) {
								attributes.push({
									name: 'RDS',
									current: parse_charac('(RD', line),
									max: ''
								});
							}
							if (line.indexOf('Init ') !== -1) {
								INIT = parse_charac('Init', line);

								if (Math.floor((DEX - 10) / 2) == Math.floor((INIT - 10) / 2)) {
									attributes.push({
										name: 'DEXTERITE',
										current: INIT,
										max: ''
									});
								} else {
									attributes.push({
										name: 'DEXTERITE',
										current: DEX,
										max: ''
									});

									attributes.push({
										name: 'INIT_DIV',
										current: INIT - DEX,
										max: ''
									});
								}
							}

							if (line.indexOf(' DM ') !== -1) {
								cpt++;

								attack_contact = NIVEAU + FOR_MOD;
								attack_distance = NIVEAU + DEX_MOD;

								var armenom = '',
									armeatk = '@{ATKCAC}',
									armeatkdiv = '',
									armedmcar = '@{FOR}',
									armedmnbde = 1,
									armedmde = 4,
									armedmdiv = '',
									armeportee = 0;

								// ici, virer le +
								armenom = line.split(' DM ')[0].trim();
								tmp = armenom.split(' ');
								tmp = tmp[tmp.length - 1];
								if (tmp.indexOf('+') !== -1) {
									tmp = tmp.split('+');
									armeatkdiv = parseInt(tmp[1].replace(/[^0-9\.]/g, ''), 10);
								} else if (tmp.indexOf('-') !== -1) {
									tmp = tmp.split('-');
									armeatkdiv = -parseInt(tmp[1].replace(/[^0-9\.]/g, ''), 10);
								}

								armenom = armenom.split('+')[0].trim();

								if (armenom.indexOf('m)') !== -1) {
									tmp = armenom.split('m)');
									armenom = armenom.split('(')[0];
									tmp = tmp[0].trim().split(' ');
									tmp = tmp[tmp.length - 1].split('(');
									armeportee = parseInt(tmp[1].trim().replace(/[^0-9\.]/g, ''), 10);
								}

								armenom = armenom.trim();

								if (armeportee > 0) {
									armeatk = '@{ATKTIR}';
									armedmcar = '0';
								}

								var dommage = line.split(' DM ')[1].trim();
								if (dommage.indexOf('d') !== -1) {
									armedmnbde = parseInt(dommage.split('d')[0].trim().replace(/[^0-9\.]/g, ''), 10);
									armedmde = dommage.split('d')[1].trim();
									if (armedmde.indexOf('+') !== -1) {
										tmp = armedmde.split('+');
										armedmde = tmp[0].trim();
										armedmdiv = tmp[1].trim()
									} else if (armedmde.indexOf('-') !== -1) {
										tmp = armedmde.split('-');
										armedmde = tmp[0].trim();
										armedmdiv = -tmp[1].trim()
									}
								}

								armeatkdiv = parseInt(armeatkdiv + ''.replace(/[^0-9\.]/g, ''), 10);
								armedmdiv = parseInt(armedmdiv + ''.replace(/[^0-9\.]/g, ''), 10);

								if (armeportee == 0) {
									armeatkdiv = armeatkdiv - attack_contact;
									armedmdiv = armedmdiv - FOR_MOD;
								} else {
									armeatkdiv = armeatkdiv - attack_distance;
								}

								if (!armeatkdiv) armeatkdiv = '';
								if (!armedmdiv) armedmdiv = '';

								var bonus_degat = line.split(' DM ')[0].split(' ');
								bonus_degat = bonus_degat[bonus_degat.length - 1];
								if (bonus_degat.indexOf('+') !== -1) bonus_degat = bonus_degat.replace('+', '');

								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armenom',
									current: armenom,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armeatk',
									current: armeatk,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armeatkdiv',
									current: armeatkdiv,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armedmcar',
									current: armedmcar,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armedmnbde',
									current: armedmnbde,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armedmde',
									current: armedmde,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armedmdiv',
									current: armedmdiv,
									max: ''
								});
								attributes.push({
									name: 'repeating_armes_' + i + '_' + 'armeportee',
									current: armeportee,
									max: ''
								});
							}
						}
					});

					_.each(attributes, function(attribute, i) {
						var new_attribute = createObj("attribute", {
							_characterid: charId,
							name: attribute.name,
							current: attribute.current,
							max: attribute.max
						});
					});

					Added_Characters.push(character.name);
				} else sendChat('COIE', '/w gm Import impossible. Le contenu du handout COImport semble incorrect...');
			}
		});
	});

	if (Added_Characters.length > 0) {
		sendChat('COIE', '/w gm Import de ' + Added_Characters.join(', ') + ' effectué.');
	}
}

function check_command(msg) {
	msg.content = msg.content.replace(/\s+/g, ' '); //remove duplicate whites
	var command = msg.content.split(" ", 1);

	switch (command[0]) {
		case "!co-export":
			export_character(msg);
			return;
		case "!co-import":
			import_character();
			return;
		case "!co-turn_action":
			turn_action(msg);
			return;
		default:
			return;
	}
}

on("ready", function() {
	COIE_Loaded = true;
	log("CO Import/Export version " + script_version + " loaded.");
});

on("chat:message", function(msg) {
	"use strict";
	if (!COIE_Loaded || msg.type != "api") return;
	msg.date = (new Date()).toISOString().split('.')[0].replace('T', '_');
	check_command(msg);
});

on("change:handout", function(obj) {
	if (obj.get('name') == "COImport") import_character();
});