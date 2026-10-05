REPLAY ?= /Users/ivaniuss/Downloads/replay-2026-09-15T23-52-34-353Z.colreplay
OUT ?= $(CURDIR)/decoded/replay-2026-09-15T23-52-34-353Z
DECODER_DIR ?= $(CURDIR)

.PHONY: help install decode clean

help:
	@echo "Uso:"
	@echo "  make install                      # instala dependencias del decodificador"
	@echo "  make decode                       # decodifica REPLAY hacia OUT"
	@echo "  make decode REPLAY=... OUT=...    # decodifica otro replay"
	@echo "  make clean                        # borra la carpeta decoded/"

install:
	cd "$(DECODER_DIR)" && npm install --no-audit --no-fund

decode:
	mkdir -p "$(OUT)"
	cd "$(DECODER_DIR)" && npx tsx src/decode.ts "$(REPLAY)" --out "$(OUT)"

clean:
	rm -rf "$(CURDIR)/decoded"
