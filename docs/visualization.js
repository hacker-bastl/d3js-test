// https://github.com/hacker-bastl/git-api-d3js-test#readme

const githubModel = {
  networkData: {
    ids: new Map(),
    nodes: [],
    links: [],
  },

  // TODO: refactor, this is redundant w/ d3 data model
  uniqueNode: function(data, type) {
    if (!data.id) throw new Error('data id missing');
    if (!data.type) data.type = type || 'unknown';

    if (githubModel.networkData.ids.has(data.id))
      return githubModel.networkData.ids.get(data.id);

    githubModel.networkData.ids.set(data.id, data);
    githubModel.networkData.nodes.push(data);
    return data;
  },

  // TODO: refactor, wrong abstraction here
  connectNode: function(data, type) {
    var connection = {
      source: githubModel.uniqueNode(data, type),
      timestamp: function(timestamp) {
        var date = (timestamp || 'unknown').substring(0, 10);
        if (date.length != 10) console.warn(timestamp); // TODO
        var node = githubModel.uniqueNode({
          name: date,
          id: date,
        }, 'date');
        return connection.connect(node);
      },
      connect: function(data, type) {
        githubModel.networkData.links.push({
          target: githubModel.uniqueNode(data, type),
          source: connection.source,
        });
        return connection;
      },
    };
    return connection;
  },

  // TODO: refactor, this is redundant w/ d3 data model
  clearContents: function() {
    while (githubModel.networkData.links.length > 0)
      delete(githubModel.networkData.links.pop());
    while (githubModel.networkData.nodes.length > 0)
      delete(githubModel.networkData.nodes.pop());
    githubModel.networkData.ids.clear();
    return githubModel;
  },

};

// TODO: how to abstract this properly?
githubModel.repository = function(data) {
  var repo = githubModel.connectNode(data, 'Repository');
  repo.timestamp(data.updated_at || data.created_at);

  data.owner.name = data.owner.login;
  repo.connect(data.owner, 'user');

  return repo;
};

// TODO: how to abstract this properly?
githubModel.event = function(data) {
  var event = githubModel.connectNode(data, 'Event');
  event.timestamp(data.updated_at || data.created_at);

  // TODO: refactur / extract to own parsers?
  if (!!data.actor) event.connect(data.actor, 'User');
  if (!!data.org) event.connect(data.org, 'Organization');
  if (!!data.repo) event.connect(data.repo, 'Repository');
  // if (!!data.payload) event.connect(data.payload); // TODO
  return event;
};

// graph with automated resizing and zoom
const networkGraph = new function() {
  // https://bl.ocks.org/mbostock/1095795
  var root = d3.select('svg').attr('x', 0).attr('y', 0).attr('width', window.innerWidth).attr('height', window.innerHeight);
  var canvas = root.append('g').attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')');
  var zoom = 1; // TODO: smells?

  // http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
  this.color = d3.scaleOrdinal(d3['schemeCategory20c']);

  // persistent pointers to graph data
  this.links = canvas.selectAll('line');
  this.nodes = canvas.selectAll('g');

  // update overall transformation on resize
  d3.select(window).on('resize', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
    root.attr('width', window.innerWidth).attr('height', window.innerHeight);
  });

  // https://github.com/d3/d3-zoom#zoom
  root.call(d3.zoom().scaleExtent([0.2, 2.0]).on('zoom', function() {
    zoom = d3.event.transform.k;
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
  }));
};

// https://github.com/d3/d3-force/#forceSimulation
networkGraph.layout = d3.forceSimulation(githubModel.networkData.nodes)
  .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
  // https://github.com/d3/d3-force/#manyBody_strength
  .force('charge', d3.forceManyBody().strength(10 * -30))
  // https://github.com/d3/d3-force/#link_distance
  .force('link', d3.forceLink(githubModel.networkData.links).distance(5 * 30))
  // https://github.com/d3/d3-force/#simulation_tick
  .on('tick', function() {
    networkGraph.nodes.attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
    networkGraph.links.attr('x1', function(d) {
      return d.source.x;
    }).attr('y1', function(d) {
      return d.source.y;
    }).attr('x2', function(d) {
      return d.target.x;
    }).attr('y2', function(d) {
      return d.target.y;
    });
  });

// https://bl.ocks.org/mbostock/3808218
networkGraph.updateData = function(displayData) {
  networkGraph.nodes = networkGraph.nodes.data(displayData.nodes, function(d) {
    return d.id;
  });
  networkGraph.nodes.exit().remove();
  networkGraph.nodes = networkGraph.nodes.enter().append('g').merge(networkGraph.nodes);

  // TODO: smells - refactor!
  networkGraph.nodes.append('image').attr('xlink:href', function(d, i) {
    if (d.has_avatar = !!d.avatar_url)
      return d.avatar_url;
    else switch (d.type) {
      case 'User':
        return '//assets-cdn.github.com/images/icons/emoji/unicode/1f464.png';
      case 'Repository':
      case 'Organization':
        return '//assets-cdn.github.com/images/icons/emoji/unicode/1f465.png';
      default:
        return '//assets-cdn.github.com/images/icons/emoji/octocat.png';
    }
  }).attr('x', function(d, i) {
    return !!d.has_avatar ? -32 : -16;
  }).attr('y', function(d, i) {
    return !!d.has_avatar ? -32 : -16;
  }).attr('width', function(d, i) {
    return !!d.has_avatar ? 64 : 32;
  }).attr('height', function(d, i) {
    return !!d.has_avatar ? 64 : 32;
  });

  // TODO: use title as well / instead?
  networkGraph.nodes.append('text').text(function(d) {
    return d.name || d.login || d.type || d.id;
  }).attr('y', '1.2em');

  // hook up onclick eventhandler
  networkGraph.nodes.on('click', networkGraph.click);

  // update links
  networkGraph.links = networkGraph.links.data(displayData.links, function(d) {
    return d.source.id + '-' + d.target.id;
  });
  networkGraph.links.exit().remove();
  networkGraph.links = networkGraph.links.enter().insert('line', 'g').merge(networkGraph.links);
  // restart layoput
  networkGraph.layout.nodes(displayData.nodes);
  networkGraph.layout.force('link').links(displayData.links);
  networkGraph.layout.alpha(1).restart();
};

// initial layout start
d3.select(window).on('load', function() {
  networkGraph.updateData(githubModel.networkData);
});

// https://developer.mozilla.org/docs/Web/API/Window/open
networkGraph.click = function(node) {
  // for debugging...
  console.info(node);

  // TODO: use "real" SVG link instead...
  if (d3.event.shiftKey) {
    var address = node.html_url || node.url || false;
    if (!!address) location.href = address;
  }

  // TODO: "expand" data
  switch (node.type) {
    case 'User':
      if (!!node.repos_url)
        d3.json(node.repos_url, function(response) {
          console.log(response);
        });
      if (!!node.organizations_url)
        d3.json(node.organizations_url, function(response) {
          console.log(response);
        });
      if (!!node.events_url)
        d3.json(node.events_url, function(response) {
          console.log(response);
        });

      // TODO ...
      break;

    default:
      if (!!node.url) d3.json(node.url, function(response) {
        // networkGraph.click(response);
        console.log(response); // TODO
      });
  }
};

// https://help.github.com/articles/search-syntax/
networkGraph.search = function(text) {
  githubModel.clearContents();
  networkGraph.updateData(githubModel.networkData);
  d3.json('//api.github.com/search/repositories?q=' + text, function(error, result) {
    if (!!error) throw error;
    result.items.forEach(githubModel.repository);
    networkGraph.updateData(githubModel.networkData);
  });
};

d3.select(window).on('load', function() {

  // https: //developer.github.com/v3/repos/commits/#list-commits-on-a-repository
  d3.json('//api.github.com/repos/hacker-bastl/git-api-d3js-test/commits?per_page=1', function(error, response) {
    if (!!error) throw error;
    var serverTime = new Date(response.shift().commit.committer.date);
    var localTime = new Date(serverTime.getTime() - serverTime.getTimezoneOffset() * 60 * 1E3).toJSON().replace(/[TZ]+/g, ' ');
    console.log('code updated on ' + localTime);
    document.title += ' ' + localTime;
  });

  // https://developer.github.com/v3/activity/events/#list-public-events
  d3.json('//api.github.com/events?per_page=16', function(error, events) {
    if (!!error) throw error;
    events.forEach(githubModel.event);
    networkGraph.updateData(githubModel.networkData);
  });
});

// d3.select(window).on doesn't work here - why?
window.addEventListener('load', function() {
  var inputNode = document.querySelector('[role=search]>input[type=text]');
  var inputDelay = null;
  inputNode.addEventListener('keyup', function() {
    clearTimeout(inputDelay);
    inputDelay = setTimeout(function() {
      var query = inputNode.value.trim();
      if (query.length > 2)
        networkGraph.search(query);
    }, 2E3);
  });
});
