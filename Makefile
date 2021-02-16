JS_COMPILER ?= ./node_modules/uglify-js/bin/uglifyjs
FILES = \
	src/util.js \
	src/dialup.js \
	src/client.js \

all: \
	dialup.js \
	dialup.min.js

dialup.js: ${FILES}
	@rm -f $@
	@echo "(function(global){" >> $@.tmp
	@echo "'use strict'" >> $@.tmp
	@cat $(filter %.js,${FILES}}) >> $@.tmp
	@echo "}(this))" >> $@.tmp
	@$(JS_COMPILER) $@.tmp -b indent_level=2 -o $@
	@rm $@.tmp
	@chmod a-w $@

dialup.min.js: dialup.js
	@rm -f $@
	@$(JS_COMPILER) $< -c -m -o $@ \
		--source-map \
		&& du -h $< $@

deps:
	mkdir -p node_modules
	npm install

clean:
	rm -f dialup*.js*
