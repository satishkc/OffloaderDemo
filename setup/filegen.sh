rm -f ./*_pb.js # This line will clear out any previous files with the same suffix to ensure there are no dupliucations
npx grpc_tools_node_protoc --js_out=import_style=commonjs,binary:. --grpc_out=. ./protos/pubsub_api.proto
