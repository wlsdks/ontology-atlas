# English collation tables

Generated code, not edited by hand. It is the data `icu_collator` builds the English collator on:
the root collation, the normalization tables the collator uses, and no tailoring (English orders by
the root). Source: CLDR 48.2 and ICU data through `icu4x-datagen` 2.2.0. Nothing here is read at
run time from a file or the network; the tables are in the binary.

To regenerate, in two runs into empty directories (the second replaces one file of the first):

    cargo install icu4x-datagen@2.2.0
    common="--format baked --use-separate-crates --no-internal-fallback \
            --deduplication retain-base-languages -l en"
    icu4x-datagen $common \
      -m CollationRootV1 CollationTailoringV1 CollationDiacriticsV1 CollationJamoV1 \
         CollationMetadataV1 CollationReorderingV1 CollationSpecialPrimariesV1 \
         NormalizerNfdDataV1 NormalizerNfdTablesV1 NormalizerNfdSupplementV1 \
      --out first -W
    icu4x-datagen $common --attribute-filter 'collator=/^posix$/' \
      -m CollationTailoringV1 --out second -W
    cp first/* collation_data/ && cp second/collation_tailoring_v1.rs.data collation_data/

The second run is the tailoring table with every language's tailoring left out: the ones that
remain belong to Chinese scripts and to a POSIX variant of US English, and none is read for `en`.
One attribute filter covers every collation table, so a single run would drop the defaults the
others need.
