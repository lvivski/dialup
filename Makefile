JS_COMPILER ?= ./node_modules/uglify-js/bin/uglifyjs
FILES = \
	src/util.js \
	src/client.js \
	src/dialup.js \
	
LIBS = \
	node_modules/subsequent/subsequent.js \
	node_modules/davy/davy.js \
	node_modules/streamlet/streamlet.js \

all: \
	dialup.js \
	dialup.min.js

dialup.js: ${FILES} ${LIBS}
	@rm -f $@
	@cat $(filter %.js,${LIBS}}) > $@.tmp
	@echo "(function(global){" >> $@.tmp
	@echo "'use strict'" >> $@.tmp
	@cat $(filter %.js,${FILES}}) >> $@.tmp
	@echo "}(this))" >> $@.tmp
	@$(JS_COMPILER) $@.tmp -b indent-level=2 -o $@
	@rm $@.tmp
	@chmod a-w $@

dialup.min.js: dialup.js
	@rm -f $@
	@$(JS_COMPILER) $< -c -m -o $@ \
		--source-map $@.map \
		&& du -h $< $@

deps:
	mkdir -p node_modules
	npm install

clean:
	rm -f dialup*.js*
