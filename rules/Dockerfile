FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN go test ./... && CGO_ENABLED=0 go build -o /rules .

FROM gcr.io/distroless/static-debian12
COPY --from=build /rules /rules
EXPOSE 8081
ENTRYPOINT ["/rules"]
